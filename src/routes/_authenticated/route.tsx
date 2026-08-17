import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { canAccessPath } from "@/lib/nav";
import { primaryRole, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
      supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle(),
    ]);

    if ((profile as { is_active?: boolean } | null)?.is_active === false) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    const roleList = (roles ?? []).map((r) => r.role as AppRole);
    if (roleList.length === 0) throw redirect({ to: "/complete-profile" });

    const role = primaryRole(roleList);
    if (!canAccessPath(role, location.pathname)) {
      throw redirect({ to: "/dashboard" });
    }

    return { user: data.user, role, roles: roleList };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
