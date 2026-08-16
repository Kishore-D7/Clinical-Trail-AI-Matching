import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  FlaskConical,
  Activity,
  Sparkles,
  AlertCircle,
  FileText,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { roleLabels, useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TrialBridge Clinical Trial Matching" },
      {
        name: "description",
        content:
          "Live counts of patients, clinical trials, potential matches and documents in your research workspace.",
      },
      { property: "og:title", content: "Dashboard — TrialBridge" },
      {
        property: "og:description",
        content: "Live counts of patients, trials, matches and documents in your workspace.",
      },
    ],
  }),
  component: DashboardPage,
});

async function unwrap(result: { count: number | null; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

const headCount = { count: "exact" as const, head: true };

function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => ({
      patients: await unwrap(await supabase.from("patients").select("*", headCount)),
      trials: await unwrap(await supabase.from("clinical_trials").select("*", headCount)),
      activeTrials: await unwrap(
        await supabase.from("clinical_trials").select("*", headCount).eq("status", "RECRUITING"),
      ),
      matches: await unwrap(
        await supabase.from("trial_matches").select("*", headCount).eq("status", "POTENTIAL"),
      ),
      needsReview: await unwrap(
        await supabase.from("trial_matches").select("*", headCount).eq("needs_review", true),
      ),
      processing: await unwrap(
        await supabase
          .from("documents")
          .select("*", headCount)
          .in("processing_status", ["PENDING", "PROCESSING"]),
      ),
    }),
  });
}

type Stat = { title: string; value: number | undefined; hint: string; icon: LucideIcon };

function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: stats, isLoading, error } = useDashboardStats();

  const cards: Stat[] = [
    { title: "Total Patients", value: stats?.patients, hint: "Records in the registry", icon: Users },
    { title: "Total Clinical Trials", value: stats?.trials, hint: "Trials in the catalogue", icon: FlaskConical },
    { title: "Active Trials", value: stats?.activeTrials, hint: "Currently recruiting", icon: Activity },
    { title: "Potential Matches", value: stats?.matches, hint: "Awaiting confirmation", icon: Sparkles },
    { title: "Needs Review", value: stats?.needsReview, hint: "Flagged for coordinator review", icon: AlertCircle },
    { title: "Documents Processing", value: stats?.processing, hint: "Pending or in progress", icon: FileText },
  ];

  const nameParts = (user?.profile?.full_name ?? "").split(" ").filter(Boolean);
  const name = (nameParts[0]?.endsWith(".") ? nameParts[1] : nameParts[0]) ?? "there";
  const role = user?.roles?.[0];

  return (
    <div className="space-y-6">
      <section className="hero-gradient relative overflow-hidden rounded-xl p-6 text-sidebar-foreground shadow-[var(--shadow-card)]">
        <div className="relative space-y-1">
          <p className="text-sm text-sidebar-foreground/70">
            {role ? roleLabels[role] : "Research workspace"}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back, {name}</h2>
          <p className="max-w-xl text-sm text-sidebar-foreground/70">
            Live figures from your workspace. Patient intake, trial curation and match review all
            feed these numbers.
          </p>
        </div>
      </section>

      {error && (
        <p className="text-sm text-destructive">Could not load statistics. Please try again.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title} className="shadow-[var(--shadow-card)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <card.icon className="size-4" />
              </span>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight">{card.value ?? 0}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
