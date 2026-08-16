import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, HelpCircle, ListChecks, Loader2, Play, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { runTrialMatchBatch } from "@/lib/matching.functions";
import { formatNumber } from "@/lib/patients";
import { criterionExpression } from "@/lib/trials";

export const Route = createFileRoute("/_authenticated/ai-matching")({
  head: () => ({
    meta: [
      { title: "Eligibility Matching Engine — TrialBridge" },
      {
        name: "description",
        content:
          "Run the deterministic rule-based eligibility engine that scores structured patient data against structured trial criteria.",
      },
      { property: "og:title", content: "Eligibility Matching Engine — TrialBridge" },
      {
        property: "og:description",
        content: "Deterministic patient-to-trial criteria evaluation with a full audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatchingEnginePage,
});

type RunStats = {
  processed: number;
  total: number;
  potential: number;
  needsReview: number;
  ineligible: number;
};

function MatchingEnginePage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = (currentUser?.roles ?? []).length > 0;

  const [trialId, setTrialId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<RunStats | null>(null);
  const cancelRef = useRef(false);

  const runBatch = useServerFn(runTrialMatchBatch);

  const trialsQuery = useQuery({
    queryKey: ["matching-trials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_trials")
        .select("id, trial_code, title, status")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const patientCountQuery = useQuery({
    queryKey: ["matching-patient-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("patients")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const criteriaQuery = useQuery({

    queryKey: ["matching-criteria", trialId],
    enabled: Boolean(trialId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_criteria")
        .select("*")
        .eq("trial_id", trialId)
        .order("criterion_type", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  async function runEngine() {
    if (!trialId) {
      toast.error("Select a trial first");
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    const totals: RunStats = { processed: 0, total: 0, potential: 0, needsReview: 0, ineligible: 0 };
    setStats(totals);
    try {
      let offset = 0;
      for (;;) {
        if (cancelRef.current) break;
        const result = await runBatch({ data: { trialId, offset } });
        totals.processed += result.processed;
        totals.total = result.totalPatients;
        totals.potential += result.potential;
        totals.needsReview += result.needsReview;
        totals.ineligible += result.ineligible;
        setStats({ ...totals });
        if (result.nextOffset === null) break;
        offset = result.nextOffset;
      }
      await queryClient.invalidateQueries({ queryKey: ["trial-matches"] });
      toast.success(`Matched ${formatNumber(totals.processed, 0)} patients`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Matching stopped");
    } finally {
      setRunning(false);
    }
  }

  const criteria = criteriaQuery.data ?? [];
  const inclusion = criteria.filter((c) => c.criterion_type === "INCLUSION");
  const exclusion = criteria.filter((c) => c.criterion_type === "EXCLUSION");
  const progress = stats && stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Eligibility Matching Engine</h1>
        <p className="text-sm text-muted-foreground">
          Deterministic, rule-based evaluation of structured patient data against structured trial
          criteria. No language model takes part in the eligibility decision.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run matching</CardTitle>
          <CardDescription>
            Patients are evaluated server-side in batches so large cohorts stay responsive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={trialId} onValueChange={setTrialId} disabled={running}>
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Select a trial" />
              </SelectTrigger>
              <SelectContent>
                {(trialsQuery.data ?? []).map((trial) => (
                  <SelectItem key={trial.id} value={trial.id}>
                    {trial.trial_code} — {trial.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void runEngine()} disabled={!canManage || running || !trialId}>
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {running ? "Matching…" : "Run matching"}
            </Button>
            {running ? (
              <Button
                variant="outline"
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                Stop
              </Button>
            ) : null}
            <Button variant="ghost" asChild>
              <Link to="/matching-results">
                <ListChecks className="size-4" /> View results
              </Link>
            </Button>
          </div>

          {stats ? (
            <div className="space-y-3">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">
                {formatNumber(stats.processed, 0)} / {formatNumber(stats.total, 0)} patients
                evaluated ({progress}%)
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10">
                  <CheckCircle2 className="size-3.5" /> Potential match{" "}
                  {formatNumber(stats.potential, 0)}
                </Badge>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10">
                  <HelpCircle className="size-3.5" /> Needs review{" "}
                  {formatNumber(stats.needsReview, 0)}
                </Badge>
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10">
                  <XCircle className="size-3.5" /> Ineligible {formatNumber(stats.ineligible, 0)}
                </Badge>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criteria used</CardTitle>
          <CardDescription>
            Only structured criteria are evaluated. Missing patient data is recorded as UNKNOWN —
            never as a failure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!trialId ? (
            <p className="text-sm text-muted-foreground">Select a trial to preview its criteria.</p>
          ) : criteriaQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : criteria.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This trial has no eligibility criteria yet. Add them on the trial detail page first.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { label: "Inclusion", rows: inclusion },
                { label: "Exclusion", rows: exclusion },
              ].map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="text-sm font-medium">
                    {group.label} ({group.rows.length})
                  </p>
                  {group.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None defined.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {group.rows.map((row) => (
                        <li key={row.id} className="flex items-start gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.required ? "required" : "optional"}
                          </span>
                          <span>{criterionExpression(row)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
