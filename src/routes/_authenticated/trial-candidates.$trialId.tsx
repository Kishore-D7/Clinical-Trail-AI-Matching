import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  HelpCircle,
  Loader2,
  Play,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { runTrialMatchBatch } from "@/lib/matching.functions";
import {
  criterionOutcome,
  matchStatusLabel,
  matchStatusTone,
  type MatchStatus,
} from "@/lib/matching/engine";
import { exportRows, type ExportFormat } from "@/lib/matching/export";
import { formatDateTime, formatNumber, humanize, verificationTone } from "@/lib/patients";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trial-candidates/$trialId")({
  head: () => ({
    meta: [
      { title: "Find Potential Patients — TrialBridge" },
      {
        name: "description",
        content:
          "Run deterministic bulk matching of your patient population against a clinical trial and review candidate patients with a full criterion audit trail.",
      },
      { property: "og:title", content: "Find Potential Patients — TrialBridge" },
      {
        property: "og:description",
        content: "Bulk patient-to-trial matching with candidate review and export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrialCandidatesPage,
});

type CandidateFilter =
  | "ALL"
  | "POTENTIAL_MATCH"
  | "NEEDS_REVIEW"
  | "INELIGIBLE"
  | "HIGH_SCORE"
  | "MISSING_INFO"
  | "UNVERIFIED";

const FILTER_LABELS: Record<CandidateFilter, string> = {
  ALL: "All candidates",
  POTENTIAL_MATCH: "Potential match",
  NEEDS_REVIEW: "Needs review",
  INELIGIBLE: "Ineligible",
  HIGH_SCORE: "High match score (≥ 80)",
  MISSING_INFO: "Missing information",
  UNVERIFIED: "Unverified patients",
};

type RunStats = {
  total: number;
  processed: number;
  potential: number;
  needsReview: number;
  ineligible: number;
  errors: number;
};

const EXPORT_HEADERS = [
  "Patient ID",
  "Name",
  "Age",
  "Sex",
  "Match Status",
  "Match Score",
  "Passed Criteria",
  "Failed Criteria",
  "Unknown Criteria",
  "Verification Status",
  "Matched At",
  "Summary",
];

function TrialCandidatesPage() {
  const { trialId } = Route.useParams();
  const queryClient = useQueryClient();
  const runBatch = useServerFn(runTrialMatchBatch);
  const cancelRef = useRef(false);

  const [population, setPopulation] = useState<string>("ALL");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [filter, setFilter] = useState<CandidateFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const trialQuery = useQuery({
    queryKey: ["trial", trialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_trials")
        .select("id, trial_code, title, status, phase, condition")
        .eq("id", trialId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const criteriaQuery = useQuery({
    queryKey: ["trial-criteria", trialId],
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

  const jobsQuery = useQuery({
    queryKey: ["candidate-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processing_jobs")
        .select("id, file_name, total_patients_detected, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const registryCountQuery = useQuery({
    queryKey: ["registry-patient-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("patients")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const matchesQuery = useQuery({
    queryKey: ["trial-matches", trialId, "candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_matches")
        .select(
          "id, patient_id, status, score, summary, matched_at, criteria_total, criteria_passed, criteria_failed, criteria_unknown, patients(id, patient_code, full_name, age, sex, primary_condition)",
        )
        .eq("trial_id", trialId)
        .order("score", { ascending: false })
        .limit(5000);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const patientIds = useMemo(
    () => (matchesQuery.data ?? []).map((row) => row.patient_id),
    [matchesQuery.data],
  );

  const verificationQuery = useQuery({
    queryKey: ["candidate-verification", trialId, patientIds.length],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, { total: number; verified: number }>();
      for (let i = 0; i < patientIds.length; i += 200) {
        const { data, error } = await supabase
          .from("patient_measurements")
          .select("patient_id, verification_status")
          .in("patient_id", patientIds.slice(i, i + 200));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          const bucket = map.get(row.patient_id) ?? { total: 0, verified: 0 };
          bucket.total += 1;
          if (row.verification_status !== "UNVERIFIED") bucket.verified += 1;
          map.set(row.patient_id, bucket);
        }
      }
      return Object.fromEntries(map);
    },
  });

  function verificationOf(patientId: string) {
    const bucket = verificationQuery.data?.[patientId];
    if (!bucket || bucket.total === 0) return "UNVERIFIED" as const;
    if (bucket.verified === 0) return "UNVERIFIED" as const;
    if (bucket.verified < bucket.total) return "CORRECTED" as const;
    return "VERIFIED" as const;
  }

  async function runMatching() {
    cancelRef.current = false;
    setRunning(true);
    const totals: RunStats = {
      total: 0,
      processed: 0,
      potential: 0,
      needsReview: 0,
      ineligible: 0,
      errors: 0,
    };
    setStats(totals);
    try {
      let offset = 0;
      for (;;) {
        if (cancelRef.current) break;
        const result = await runBatch({
          data: { trialId, offset, jobId: population === "ALL" ? null : population },
        });
        totals.processed += result.processed;
        totals.total = result.totalPatients;
        totals.potential += result.potential;
        totals.needsReview += result.needsReview;
        totals.ineligible += result.ineligible;
        totals.errors += result.errors;
        setStats({ ...totals });
        if (result.nextOffset === null) break;
        offset = result.nextOffset;
      }
      await queryClient.invalidateQueries({ queryKey: ["trial-matches"] });
      toast.success(`Evaluated ${formatNumber(totals.processed, 0)} patients`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Matching stopped");
    } finally {
      setRunning(false);
    }
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (matchesQuery.data ?? []).filter((row) => {
      const patient = row.patients;
      if (term) {
        const haystack = `${patient?.patient_code ?? ""} ${patient?.full_name ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      switch (filter) {
        case "POTENTIAL_MATCH":
        case "NEEDS_REVIEW":
        case "INELIGIBLE":
          return row.status === filter;
        case "HIGH_SCORE":
          return Number(row.score ?? 0) >= 80;
        case "MISSING_INFO":
          return (row.criteria_unknown ?? 0) > 0;
        case "UNVERIFIED":
          return verificationOf(row.patient_id) === "UNVERIFIED";
        default:
          return true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchesQuery.data, search, filter, verificationQuery.data]);

  const summary = useMemo(() => {
    const list = matchesQuery.data ?? [];
    return {
      total: list.length,
      potential: list.filter((r) => r.status === "POTENTIAL_MATCH").length,
      needsReview: list.filter((r) => r.status === "NEEDS_REVIEW").length,
      ineligible: list.filter((r) => r.status === "INELIGIBLE").length,
    };
  }, [matchesQuery.data]);

  function handleExport(scope: "ALL" | MatchStatus | "VIEW", format: ExportFormat) {
    const source =
      scope === "VIEW"
        ? rows
        : scope === "ALL"
          ? (matchesQuery.data ?? [])
          : (matchesQuery.data ?? []).filter((row) => row.status === scope);
    if (source.length === 0) {
      toast.error("Nothing to export for that selection");
      return;
    }
    const exported = source.map((row) => ({
      "Patient ID": row.patients?.patient_code ?? "",
      Name: row.patients?.full_name ?? "",
      Age: row.patients?.age ?? "",
      Sex: row.patients?.sex ?? "",
      "Match Status": matchStatusLabel[row.status as MatchStatus] ?? row.status,
      "Match Score": Number(row.score ?? 0),
      "Passed Criteria": row.criteria_passed ?? 0,
      "Failed Criteria": row.criteria_failed ?? 0,
      "Unknown Criteria": row.criteria_unknown ?? 0,
      "Verification Status": humanize(verificationOf(row.patient_id)),
      "Matched At": row.matched_at ?? "",
      Summary: row.summary ?? "",
    }));
    const code = trialQuery.data?.trial_code ?? "trial";
    exportRows(exported, EXPORT_HEADERS, `${code}-candidates-${scope.toLowerCase()}`, format);
  }

  const progress = stats && stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;
  const trial = trialQuery.data;
  const criteriaCount = criteriaQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/clinical-trials/$trialId" params={{ trialId }}>
              <ArrowLeft className="size-4" /> Back to trial
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Find potential patients
            {trial ? (
              <span className="ml-2 font-mono text-base text-muted-foreground">
                {trial.trial_code}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {trial?.title ?? "Loading trial…"} — deterministic rule evaluation, no language model
            decides eligibility.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/matching-results">All matching results</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select population and start matching</CardTitle>
          <CardDescription>
            Patients are processed server-side in batches of 100, so cohorts of 1,000+ patients stay
            responsive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={population} onValueChange={setPopulation} disabled={running}>
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Select a population" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  Entire patient registry
                  {registryCountQuery.data !== undefined
                    ? ` (${formatNumber(registryCountQuery.data, 0)})`
                    : ""}
                </SelectItem>
                {(jobsQuery.data ?? []).map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    Job — {job.file_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void runMatching()} disabled={running || criteriaCount === 0}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? "Matching…" : "Start matching"}
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
          </div>

          {criteriaQuery.isPending ? (
            <Skeleton className="h-5 w-48" />
          ) : criteriaCount === 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              This trial has no eligibility criteria yet. Add criteria on the trial detail page
              before matching.
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {criteriaCount} structured criteria will be evaluated per patient.
            </p>
          )}

          {stats ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {running ? "Matching patients…" : "Matching complete"}
                </span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground tabular-nums">
                {formatNumber(stats.processed, 0)} / {formatNumber(stats.total, 0)} processed
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10">
                  <CheckCircle2 className="size-3.5" /> Potential matches{" "}
                  {formatNumber(stats.potential, 0)}
                </Badge>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10">
                  <HelpCircle className="size-3.5" /> Needs review{" "}
                  {formatNumber(stats.needsReview, 0)}
                </Badge>
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10">
                  <XCircle className="size-3.5" /> Ineligible {formatNumber(stats.ineligible, 0)}
                </Badge>
                <Badge variant="outline">Errors {formatNumber(stats.errors, 0)}</Badge>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">2. Candidate patients</CardTitle>
              <CardDescription>
                {formatNumber(summary.total, 0)} evaluated · {formatNumber(summary.potential, 0)}{" "}
                potential · {formatNumber(summary.needsReview, 0)} needs review ·{" "}
                {formatNumber(summary.ineligible, 0)} ineligible
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="size-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {(
                  [
                    ["VIEW", "Current view"],
                    ["ALL", "All results"],
                    ["POTENTIAL_MATCH", "Potential matches"],
                    ["NEEDS_REVIEW", "Needs review"],
                    ["INELIGIBLE", "Ineligible"],
                  ] as const
                ).map(([scope, label]) => (
                  <div key={scope}>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {label}
                    </DropdownMenuLabel>
                    <div className="flex gap-1 px-2 pb-1">
                      {(
                        [
                          ["csv", "CSV"],
                          ["json", "JSON"],
                          ["xls", "Excel"],
                        ] as const
                      ).map(([format, formatLabel]) => (
                        <Button
                          key={format}
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleExport(scope, format)}
                        >
                          {formatLabel}
                        </Button>
                      ))}
                    </div>
                    <DropdownMenuSeparator />
                  </div>
                ))}
                <DropdownMenuItem disabled className="text-xs">
                  Excel files use SpreadsheetML (.xls)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient ID or name"
                className="pl-8"
              />
            </div>
            <Select value={filter} onValueChange={(value) => setFilter(value as CandidateFilter)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FILTER_LABELS) as CandidateFilter[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {FILTER_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {matchesQuery.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : matchesQuery.isError ? (
            <p className="text-sm text-destructive">
              {(matchesQuery.error as Error).message || "Could not load candidates."}
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {summary.total === 0
                  ? "No patients have been matched against this trial yet. Start matching above."
                  : "No candidates match the current filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead>Sex</TableHead>
                    <TableHead>Match status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Passed</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Unknown</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const verification = verificationOf(row.patient_id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">
                          {row.patients?.patient_code ?? "—"}
                        </TableCell>
                        <TableCell>{row.patients?.full_name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.patients?.age ?? "—"}
                        </TableCell>
                        <TableCell>{humanize(row.patients?.sex)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(matchStatusTone[row.status as MatchStatus])}
                          >
                            {matchStatusLabel[row.status as MatchStatus] ?? row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.score, 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.criteria_passed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.criteria_failed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.criteria_unknown}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(verificationTone[verification])}>
                            {humanize(verification)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(row.id)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CandidateDetailDialog
        matchId={selected}
        onOpenChange={(open) => setSelected(open ? selected : null)}
      />
    </div>
  );
}

function CandidateDetailDialog({
  matchId,
  onOpenChange,
}: {
  matchId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["candidate-detail", matchId],
    enabled: Boolean(matchId),
    queryFn: async () => {
      const { data: match, error } = await supabase
        .from("trial_matches")
        .select(
          "id, patient_id, trial_id, status, score, summary, matched_at, criteria_total, criteria_passed, criteria_failed, criteria_unknown, patients(id, patient_code, full_name, age, sex, primary_condition, status), clinical_trials(trial_code, title)",
        )
        .eq("id", matchId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!match) throw new Error("Candidate not found");

      const [results, measurements] = await Promise.all([
        supabase
          .from("criterion_results")
          .select("*")
          .eq("match_id", match.id)
          .order("criterion_type", { ascending: true }),
        supabase
          .from("patient_measurements")
          .select(
            "id, metric, value, unit, measured_on, source, source_page, confidence, verification_status, patient_documents(file_name)",
          )
          .eq("patient_id", match.patient_id),
      ]);
      if (results.error) throw new Error(results.error.message);
      if (measurements.error) throw new Error(measurements.error.message);
      return { match, results: results.data ?? [], measurements: measurements.data ?? [] };
    },
  });

  const detail = detailQuery.data;
  const missing = (detail?.results ?? []).filter((row) => row.result === "UNKNOWN");

  return (
    <Dialog open={Boolean(matchId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {detail?.match.patients?.patient_code ?? "Candidate"}
            {detail?.match.patients?.full_name ? ` — ${detail.match.patients.full_name}` : ""}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.match.clinical_trials?.trial_code ?? ""} ${detail.match.clinical_trials?.title ?? ""}`
              : "Loading candidate…"}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : detailQuery.isError ? (
          <p className="text-sm text-destructive">{(detailQuery.error as Error).message}</p>
        ) : detail ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Match status", value: matchStatusLabel[detail.match.status as MatchStatus] },
                { label: "Match score", value: formatNumber(detail.match.score, 0) },
                { label: "Age / Sex", value: `${detail.match.patients?.age ?? "—"} / ${humanize(detail.match.patients?.sex)}` },
                { label: "Evaluated", value: formatDateTime(detail.match.matched_at) },
              ].map((item) => (
                <div key={item.label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Explanation</p>
              <p className="mt-1 text-sm">
                {detail.match.summary ?? "No explanation recorded for this evaluation."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Generated by the deterministic rule engine — {detail.match.criteria_passed} passed,{" "}
                {detail.match.criteria_failed} failed, {detail.match.criteria_unknown} unknown of{" "}
                {detail.match.criteria_total} criteria.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Criterion-by-criterion results</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Actual</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.results.map((row) => {
                      const outcome = criterionOutcome(row.criterion_type, row.result);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs">{humanize(row.criterion_type)}</TableCell>
                          <TableCell className="text-xs">{row.field}</TableCell>
                          <TableCell className="text-xs">
                            {row.operator} {row.expected_value} {row.unit ?? ""}
                          </TableCell>
                          <TableCell className="text-xs">{row.actual_value ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(outcome.tone)}>
                              {outcome.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.reason}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Source evidence</p>
              {detail.measurements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No structured measurements recorded for this patient.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {detail.measurements.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{humanize(row.metric)}</span>
                      <span className="tabular-nums">
                        {formatNumber(row.value)} {row.unit}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {row.source === "AI" ? "AI extracted" : "Manual"}
                      </Badge>
                      {row.patient_documents?.file_name ? (
                        <span className="text-xs text-muted-foreground">
                          {row.patient_documents.file_name}
                          {row.source_page ? ` · page ${row.source_page}` : ""}
                        </span>
                      ) : null}
                      {row.confidence !== null ? (
                        <span className="text-xs text-muted-foreground">
                          confidence {formatNumber(Number(row.confidence) * 100, 0)}%
                        </span>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={cn("text-xs", verificationTone[row.verification_status])}
                      >
                        {humanize(row.verification_status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Missing information</p>
              {missing.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every criterion could be evaluated with available data.
                </p>
              ) : (
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {missing.map((row) => (
                    <li key={row.id}>
                      {row.field} — {row.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {detail.match.patients?.id ? (
              <Button asChild variant="outline">
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: detail.match.patients.id }}
                >
                  Open patient record
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
