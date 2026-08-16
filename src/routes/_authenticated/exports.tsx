import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileDown, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  deleteCandidateExport,
  generateCandidateExport,
  getCandidateExportUrl,
} from "@/lib/exports.functions";
import {
  FORMAT_LABELS,
  MATCHING_ENGINE_VERSION,
  SCOPE_LABELS,
  type CandidateExportFormat,
  type CandidateExportScope,
} from "@/lib/exports/candidate-file";
import { formatDateTime, formatNumber } from "@/lib/patients";

export const Route = createFileRoute("/_authenticated/exports")({
  head: () => ({
    meta: [
      { title: "Candidate File Exports — TrialBridge" },
      {
        name: "description",
        content:
          "Generate trial-ready candidate datasets (CSV, JSON, Excel) from matched patients for clinical research review.",
      },
      { property: "og:title", content: "Candidate File Exports — TrialBridge" },
      {
        property: "og:description",
        content: "Trial-ready candidate files for human research review — never a final eligibility decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExportsPage,
});

const STATUS_TONE: Record<string, string> = {
  READY: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  PENDING: "bg-muted text-muted-foreground",
  GENERATING: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  FAILED: "bg-destructive/10 text-destructive",
};

function ExportsPage() {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateCandidateExport);
  const signUrl = useServerFn(getCandidateExportUrl);
  const remove = useServerFn(deleteCandidateExport);

  const [open, setOpen] = useState(false);
  const [trialId, setTrialId] = useState("");
  const [scope, setScope] = useState<CandidateExportScope>("ALL");
  const [format, setFormat] = useState<CandidateExportFormat>("csv");
  const [jobId, setJobId] = useState("ALL");
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const trialsQuery = useQuery({
    queryKey: ["export-trials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_trials")
        .select("id, trial_code, title")
        .order("trial_code", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["export-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processing_jobs")
        .select("id, file_name")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const exportsQuery = useQuery({
    queryKey: ["candidate-exports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_exports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (input: {
      trialId: string;
      scope: CandidateExportScope;
      format: CandidateExportFormat;
      jobId: string | null;
      name: string | null;
      exportId: string | null;
    }) => generate({ data: input }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["candidate-exports"] });
      toast.success(`Candidate file ready — ${formatNumber(result.counts.total, 0)} patients`);
      setOpen(false);
      setName("");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not generate the file"),
  });

  async function handleDownload(id: string) {
    setBusyId(id);
    try {
      const { url } = await signUrl({ data: { exportId: id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await remove({ data: { exportId: id } });
      await queryClient.invalidateQueries({ queryKey: ["candidate-exports"] });
      toast.success("Export deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const rows = exportsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Candidate file exports</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Structured research candidate datasets for human review — not a final medical
            eligibility decision. Files are stored privately and downloaded through short-lived
            signed links.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <FileDown className="size-4" /> Generate export
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate candidate file</DialogTitle>
              <DialogDescription>
                Built from stored matching results using engine {MATCHING_ENGINE_VERSION}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Trial</Label>
                <Select value={trialId} onValueChange={setTrialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a clinical trial" />
                  </SelectTrigger>
                  <SelectContent>
                    {(trialsQuery.data ?? []).map((trial) => (
                      <SelectItem key={trial.id} value={trial.id}>
                        {trial.trial_code} — {trial.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Export type</Label>
                  <Select
                    value={scope}
                    onValueChange={(value) => setScope(value as CandidateExportScope)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SCOPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select
                    value={format}
                    onValueChange={(value) => setFormat(value as CandidateExportFormat)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FORMAT_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Source population</Label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Entire patient registry</SelectItem>
                    {(jobsQuery.data ?? []).map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        Job — {job.file_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-name">Export name (optional)</Label>
                <Input
                  id="export-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Q3 diabetes screening candidates"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!trialId || generateMutation.isPending}
                onClick={() =>
                  generateMutation.mutate({
                    trialId,
                    scope,
                    format,
                    jobId: jobId === "ALL" ? null : jobId,
                    name: name || null,
                    exportId: null,
                  })
                }
              >
                {generateMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileDown className="size-4" />
                )}
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated files</CardTitle>
          <CardDescription>
            Each file embeds metadata: timestamp, trial, source job, patient counts and engine
            version. Regenerate after data changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {exportsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : exportsQuery.isError ? (
            <p className="text-sm text-destructive">
              {(exportsQuery.error as Error)?.message ?? "Could not load exports"}
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Download className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No exports yet</p>
              <p className="text-sm text-muted-foreground">
                Generate a candidate file once patients have been matched against a trial.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Export name</TableHead>
                    <TableHead>Trial</TableHead>
                    <TableHead className="text-right">Patients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Generated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[18rem]">
                        <div className="truncate font-medium">{row.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {SCOPE_LABELS[row.scope as CandidateExportScope]} ·{" "}
                          {row.format.toUpperCase()} · {row.potential_count} potential ·{" "}
                          {row.needs_review_count} review · {row.ineligible_count} ineligible
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.trial_code ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.patient_count, 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_TONE[row.status] ?? ""}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(row.generated_at ?? row.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Download"
                            disabled={busyId === row.id || row.status !== "READY"}
                            onClick={() => void handleDownload(row.id)}
                          >
                            <Download className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Regenerate"
                            disabled={generateMutation.isPending || !row.trial_id}
                            onClick={() =>
                              generateMutation.mutate({
                                trialId: row.trial_id!,
                                scope: row.scope as CandidateExportScope,
                                format: row.format as CandidateExportFormat,
                                jobId: row.job_id,
                                name: row.name,
                                exportId: row.id,
                              })
                            }
                          >
                            <RefreshCw className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            disabled={busyId === row.id}
                            onClick={() => void handleDelete(row.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
