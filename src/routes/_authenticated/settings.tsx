import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { roleDescriptions, roleLabels } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & settings — TrialBridge" },
      { name: "description", content: "View your profile details, role and workspace access." },
      { property: "og:title", content: "Profile & settings — TrialBridge" },
      {
        property: "og:description",
        content: "View your profile details, role and workspace access.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: user, isLoading, isError } = useCurrentUser();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.profile) return;
    setFullName(user.profile.full_name ?? "");
    setOrganization(user.profile.organization ?? "");
    setJobTitle(user.profile.job_title ?? "");
  }, [user?.profile]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, organization, job_title: jobTitle })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
    queryClient.invalidateQueries({ queryKey: ["current-user"] });
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !user) {
    return (
      <p className="text-sm text-destructive">We couldn't load your profile. Please try again.</p>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your role</CardTitle>
          <CardDescription>
            Roles control what you can see and do. Only administrators can change roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {user.role ? (
              <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                {user.role === "ADMIN" && <ShieldCheck className="mr-1 size-3" />}
                {roleLabels[user.role]}
              </Badge>
            ) : (
              <Badge variant="outline">No role assigned</Badge>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" /> Managed by an administrator
            </span>
          </div>
          {user.role && (
            <p className="text-sm text-muted-foreground">{roleDescriptions[user.role]}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your account details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job title</Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
