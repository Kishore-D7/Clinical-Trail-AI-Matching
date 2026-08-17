import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { primaryRole, roleDescriptions, roleLabels, type AppRole } from "@/lib/roles";

export type { AppRole };
export { roleLabels, roleDescriptions };

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;

      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      const roleList = (roles ?? []).map((r) => r.role as AppRole);

      return {
        id: user.id,
        email: user.email ?? "",
        profile,
        roles: roleList,
        role: primaryRole(roleList),
        isActive: (profile as { is_active?: boolean } | null)?.is_active ?? true,
        isAdmin: roleList.includes("ADMIN"),
      };
    },
  });
}

export function initials(name: string | null | undefined, email: string) {
  const source = (name ?? "").trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").concat(parts[1]?.[0] ?? "").toUpperCase();
}
