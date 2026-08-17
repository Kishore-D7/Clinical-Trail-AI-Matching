import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleSelector } from "@/components/role-selector";
import { supabase } from "@/integrations/supabase/client";
import { completeProfileRole } from "@/lib/admin-users.functions";
import { SELF_ASSIGNABLE_ROLES, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/complete-profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Complete your profile — TrialBridge" },
      {
        name: "description",
        content: "Choose your workspace role to finish setting up your TrialBridge account.",
      },
      { property: "og:title", content: "Complete your profile — TrialBridge" },
      {
        property: "og:description",
        content: "Choose your workspace role to finish setting up your account.",
      },
    ],
  }),
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submit = useServerFn(completeProfileRole);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const meta = data.user.user_metadata as { full_name?: string; name?: string };
      setFullName(meta.full_name ?? meta.name ?? "");
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (active && (roles ?? []).length > 0) navigate({ to: "/dashboard", replace: true });
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!role) {
      setError("Please select a role to continue.");
      return;
    }
    setLoading(true);
    try {
      await submit({ data: { role, fullName } });
      await queryClient.invalidateQueries();
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your role");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-2xl shadow-[var(--shadow-elevated)]">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5 text-sm font-semibold">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Stethoscope className="size-5" />
            </span>
            TrialBridge
          </div>
          <CardTitle className="text-xl">Complete your profile</CardTitle>
          <CardDescription>
            Tell us how you'll use the workspace. Administrator access is granted by an existing
            administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Alex Moreau"
                required
              />
            </div>

            <RoleSelector
              value={role}
              onChange={(next) => {
                setRole(next);
                setError(null);
              }}
              roles={SELF_ASSIGNABLE_ROLES}
              error={error}
            />

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
