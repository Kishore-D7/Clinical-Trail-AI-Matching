import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ListChecks, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  criterionResultTone,
  matchStatusLabel,
  matchStatusTone,
  type MatchStatus,
} from "@/lib/matching/engine";
import { formatDateTime, formatNumber } from "@/lib/patients";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/matching-results")({
  head: () => ({
    meta: [
      { title: "Criteria Match Results — TrialBridge" },
      {
        name: "description",
        content:
          "Review deterministic patient-to-trial matches with a per-criterion audit trail of actual values, expected values and outcomes.",
      },
      { property: "og:title", content: "Criteria Match Results — TrialBridge" },
      {
        property: "og:description",
        content: "Per-criterion audit trail for every evaluated patient-to-trial pair.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatchingResultsPage,
});

const STATUS_FILTERS: (MatchStatus | "ALL")[] = [
  "ALL",
  "POTENTIAL_MATCH",
  "NEEDS_REVIEW",
  "INELIGIBLE",
];

function MatchingResultsPage() {
  const [trialId, setTrialId] = useState<string>("ALL");
  const [status, setStatus] = useState<MatchStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const trialsQuery = useQuery({
    queryKey: ["matching-trials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_trials")
        .select("id, trial_code, title")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const matchesQuery = useQuery({
    queryKey: ["trial-matches", trialId, status],
    queryFn: async () => {
      let query = supabase
        .from("trial_matches")
        .select(
          "id, status, score, summary, matched_at, criteria_total, criteria_passed, criteria_failed, criteria_unknown, patients(id, patient_code, full_name, age, sex), clinical_trials(id, trial_code, title)",
        )
        .order("score", { ascending: false })
        .limit(500);
      if (trialId !== "ALL") query = query.eq("trial_id", trialId);
      if (status !== "ALL") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const resultsQuery = useQuery({
    queryKey: ["criterion-results", expanded],
    enabled: Boolean(expanded),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("criterion_results")
        .select("*")
        .eq("match_id", expanded!)
        .order("criterion_type", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = matchesQuery.data ?? [];
    if (!term) return list;
    return list.filter((row) => {
      const patient = row.patients;
      return (
        patient?.patient_code?.toLowerCase().includes(term) ||
        patient?.full_name?.toLowerCase().includes(term) ||
        row.clinical_trials?.trial_code?.toLowerCase().includes(term)
      );
    });
  }, [matchesQuery.data, search]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Criteria Match Results</h1>
        <p className="text-sm text-muted-foreground">
          Every result comes from the deterministic rules engine. The Criteria Match Score is the
          share of decidable criteria that were satisfied — it is not a medical probability or an
          eligibility percentage.
        </p>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Matches</CardTitle>
              <CardDescription>
                Expand a row to see the per-criterion audit trail.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link to="/ai-matching">
                <ListChecks className="size-4" /> Run matching
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient or trial"
                className="pl-8"
              />
            </div>
            <Select value={trialId} onValueChange={setTrialId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All trials" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All trials</SelectItem>
                {(trialsQuery.data ?? []).map((trial) => (
                  <SelectItem key={trial.id} value={trial.id}>
                    {trial.trial_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus(value as MatchStatus | "ALL")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "ALL" ? "All statuses" : matchStatusLabel[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {matchesQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : matchesQuery.isError ? (
            <p className="text-sm text-destructive">
              {(matchesQuery.error as Error).message}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matches yet. Run the matching engine for a trial to generate results.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Patient</TableHead>
                    <TableHead>Trial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Criteria Match Score</TableHead>
                    <TableHead>Criteria</TableHead>
                    <TableHead>Matched</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isOpen = expanded === row.id;
                    const matchStatus = row.status as MatchStatus;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : row.id)}
                        >
                          <TableCell>
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{row.patients?.patient_code ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.patients?.full_name ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {row.clinical_trials?.trial_code ?? "—"}
                            </div>
                            <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                              {row.clinical_trials?.title ?? ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(matchStatusTone[matchStatus] ?? "")}
                            >
                              {matchStatusLabel[matchStatus] ?? row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatNumber(row.score, 0)}%
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.criteria_passed}/{row.criteria_total} passed ·{" "}
                            {row.criteria_unknown} unknown
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(row.matched_at)}
                          </TableCell>
                        </TableRow>
                        {isOpen ? (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/40">
                              <div className="space-y-3 py-2">
                                <p className="text-sm">{row.summary ?? "—"}</p>
                                {resultsQuery.isPending ? (
                                  <Skeleton className="h-20 w-full" />
                                ) : (resultsQuery.data ?? []).length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No criterion results stored for this match.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Criterion</TableHead>
                                          <TableHead>Type</TableHead>
                                          <TableHead>Actual</TableHead>
                                          <TableHead>Expected</TableHead>
                                          <TableHead>Result</TableHead>
                                          <TableHead>Reason</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {(resultsQuery.data ?? []).map((result) => (
                                          <TableRow key={result.id}>
                                            <TableCell className="font-medium">
                                              {result.field}
                                              {result.required ? "" : " (optional)"}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {result.criterion_type}
                                            </TableCell>
                                            <TableCell>{result.actual_value ?? "—"}</TableCell>
                                            <TableCell>{result.expected_value}</TableCell>
                                            <TableCell>
                                              <Badge
                                                variant="outline"
                                                className={cn(
                                                  criterionResultTone[
                                                    result.result as "PASS" | "FAIL" | "UNKNOWN"
                                                  ],
                                                )}
                                              >
                                                {result.result}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                              {result.reason ?? "—"}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
