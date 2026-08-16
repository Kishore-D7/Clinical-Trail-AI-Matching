import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileScan,
  Loader2,
  Play,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatNumber, humanize } from "@/lib/patients";
import {
  createProcessingJob,
  processJobBatch,
  retryFailedRecords,
  startProcessingJob,
} from "@/lib/processing.functions";
import {
  asExtractedFields,
  jobProgress,
  jobStatusTone,
  PATIENT_DOCUMENTS_BUCKET,
  recordStatusTone,
  validatePdfFile,
  type ProcessingJobRow,
  type ProcessingRecordRow,
} from "@/lib/processing/types";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/routes/_authenticated/patients";

export const Route = createFileRoute("/_authenticated/patient-processing")({
  head: () => ({
    meta: [
      { title: "Bulk Patient PDF Processing — TrialBridge" },
      {
        name: "description",
        content:
          "Upload large clinical PDFs and extract structured patient records in batches with AI, confidence scoring and human review.",
      },
      { property: "og:title", content: "Bulk Patient PDF Processing — TrialBridge" },
      {
        property: "og:description",
        content: "Batch extraction of patient records from large PDFs with review and retry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientProcessingPage,
});

function PatientProcessingPage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = (currentUser?.roles ?? []).length > 0;

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createJob = useServerFn(createProcessingJob);
  const startJob = useServerFn(startProcessingJob);
  const runBatch = useServerFn(processJobBatch);
  const retryRecords = useServerFn(retryFailedRecords);

  const jobsQuery = useQuery({
    queryKey: ["processing-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processing_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: running ? 2000 : false,
  });

  useEffect(() => {
    if (!selectedJobId && (jobsQuery.data?.length ?? 0) > 0) {
      setSelectedJobId(jobsQuery.data![0]!.id);
    }
  }, [jobsQuery.data, selectedJobId]);

  const selectedJob = (jobsQuery.data ?? []).find((job) => job.id === selectedJobId) ?? null;

  const recordsQuery = useQuery({
    queryKey: ["processing-records", selectedJobId],
    enabled: Boolean(selectedJobId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processing_patient_records")
        .select("*")
        .eq("job_id", selectedJobId!)
        .order("record_index", { ascending: true })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: running ? 3000 : false,
  });

  async function handleUpload(file: File) {
    const problem = validatePdfFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const path = `${crypto.randomUUID()}/${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage
        .from(PATIENT_DOCUMENTS_BUCKET)
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw new Error(error.message);

      const { jobId } = await createJob({
        data: { fileName: file.name, fileSize: file.size, storagePath: path },
      });
      toast.success("Upload complete — job created");
      await queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
      setSelectedJobId(jobId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function driveJob(jobId: string) {
    runningRef.current = true;
    setRunning(true);
    try {
      let guard = 0;
      // Batched loop: each request handles a few patient segments only, so the
      // browser stays responsive and no full document text is held client-side.
      for (;;) {
        if (!runningRef.current) break;
        const result = await runBatch({ data: { jobId } });
        guard += 1;
        await queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
        await queryClient.invalidateQueries({ queryKey: ["processing-records", jobId] });
        if (result.remaining === 0 || guard > 5000) break;
      }
      toast.success("Processing finished");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Processing stopped");
    } finally {
      runningRef.current = false;
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
    }
  }

  const startMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const result = await startJob({ data: { jobId } });
      return result;
    },
    onSuccess: async (result) => {
      toast.success(
        `${formatNumber(result.segments)} patient segments detected across ${formatNumber(result.totalPages)} pages`,
      );
      await queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
      void driveJob(result.jobId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => retryRecords({ data: { jobId } }),
    onSuccess: async (result, jobId) => {
      if (result.retried === 0) {
        toast.info("No failed records to retry");
        return;
      }
      toast.success(`Retrying ${formatNumber(result.retried)} failed records`);
      await queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
      void driveJob(jobId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: async (record: ProcessingRecordRow) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("processing_patient_records")
        .update({
          status: "VERIFIED",
          verified_by: userData.user?.id ?? null,
          verified_at: new Date().toISOString(),
        })
        .eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Record verified");
      queryClient.invalidateQueries({ queryKey: ["processing-records", selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Could not verify the record"),
  });

  function exportCsv() {
    const rows = recordsQuery.data ?? [];
    if (rows.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const header = [
      "patient_id",
      "name",
      "age",
      "sex",
      "date_of_birth",
      "status",
      "confidence",
      "page_start",
      "page_end",
      "conditions",
      "medications",
      "hba1c",
      "bmi",
      "fastingGlucose",
      "systolic",
      "diastolic",
      "ldl",
      "egfr",
      "possible_duplicate",
      "error",
    ];
    const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((row) => {
      const fields = asExtractedFields(row.fields);
      const measure = (key: string) => {
        const field = fields[key];
        if (!field) return "";
        return `${field.value ?? ""}${field.unit ? ` ${field.unit}` : ""}`;
      };
      return [
        row.patient_identifier,
        row.full_name,
        row.age,
        row.sex,
        row.date_of_birth,
        row.status,
        row.confidence,
        row.page_start,
        row.page_end,
        (row.conditions ?? []).join("; "),
        (row.medications ?? []).join("; "),
        measure("hba1c"),
        measure("bmi"),
        measure("fastingGlucose"),
        measure("systolic"),
        measure("diastolic"),
        measure("ldl"),
        measure("egfr"),
        row.is_possible_duplicate ? "YES" : "",
        row.error_message,
      ]
        .map(esc)
        .join(",");
    });
    const csv = [header.join(","), ...body].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `patient-extraction-${selectedJobId?.slice(0, 8) ?? "export"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const records = recordsQuery.data ?? [];
  const failedRecords = records.filter((row) => row.status === "FAILED");
  const duplicateRecords = records.filter((row) => row.is_possible_duplicate);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bulk Patient PDF Processing</h1>
        <p className="text-sm text-muted-foreground">
          Upload a large clinical PDF, then extract patient records in small server-side batches.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload document</CardTitle>
          <CardDescription>PDF only, up to 50 MB. Files are stored privately.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="max-w-sm"
            disabled={!canManage || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          {uploading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Uploading…
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="size-4" /> Select a PDF to create a processing job
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Processing jobs</CardTitle>
            <CardDescription>Most recent uploads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobsQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : jobsQuery.isError ? (
              <ErrorState
                message={(jobsQuery.error as Error).message}
                onRetry={() => jobsQuery.refetch()}
              />
            ) : (jobsQuery.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No processing jobs yet.
              </p>
            ) : (
              (jobsQuery.data ?? []).map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left transition hover:bg-muted/60",
                    job.id === selectedJobId && "border-primary bg-muted/60",
                  )}
                >
                  <p className="truncate text-sm font-medium">{job.file_name}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <Badge variant="outline" className={cn(jobStatusTone[job.status])}>
                      {humanize(job.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(job.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {selectedJob ? (
          <JobPanel
            job={selectedJob}
            records={records}
            recordsLoading={recordsQuery.isLoading}
            recordsError={recordsQuery.error as Error | null}
            onRetryRecords={() => recordsQuery.refetch()}
            canManage={canManage}
            running={running}
            starting={startMutation.isPending}
            retrying={retryMutation.isPending}
            failedCount={failedRecords.length}
            duplicateRecords={duplicateRecords}
            onStart={() => startMutation.mutate(selectedJob.id)}
            onResume={() => void driveJob(selectedJob.id)}
            onStop={() => {
              runningRef.current = false;
            }}
            onRetryFailed={() => retryMutation.mutate(selectedJob.id)}
            onExport={exportCsv}
            onVerify={(record) => verifyMutation.mutate(record)}
          />
        ) : (
          <Card className="flex items-center justify-center p-10">
            <div className="text-center">
              <FileScan className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Select or upload a document to begin.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function JobPanel({
  job,
  records,
  recordsLoading,
  recordsError,
  onRetryRecords,
  canManage,
  running,
  starting,
  retrying,
  failedCount,
  duplicateRecords,
  onStart,
  onResume,
  onStop,
  onRetryFailed,
  onExport,
  onVerify,
}: {
  job: ProcessingJobRow;
  records: ProcessingRecordRow[];
  recordsLoading: boolean;
  recordsError: Error | null;
  onRetryRecords: () => void;
  canManage: boolean;
  running: boolean;
  starting: boolean;
  retrying: boolean;
  failedCount: number;
  duplicateRecords: ProcessingRecordRow[];
  onStart: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetryFailed: () => void;
  onExport: () => void;
  onVerify: (record: ProcessingRecordRow) => void;
}) {
  const progress = jobProgress(job);
  const notStarted = job.status === "UPLOADED" || job.status === "FAILED";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{job.file_name}</CardTitle>
            <CardDescription>
              {(job.file_size / (1024 * 1024)).toFixed(2)} MB ·{" "}
              {formatNumber(job.total_pages)} pages · uploaded {formatDateTime(job.created_at)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!canManage || starting || running}
              onClick={notStarted ? onStart : onResume}
            >
              {starting || running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {notStarted ? "Start processing" : "Resume"}
            </Button>
            {running ? (
              <Button size="sm" variant="outline" onClick={onStop}>
                Pause
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={!canManage || retrying || failedCount === 0}
              onClick={onRetryFailed}
            >
              <RefreshCw className="size-4" /> Retry failed ({failedCount})
            </Button>
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.is_mock ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Mock development extraction — no AI provider is configured, so these values came from
                a local parser and are not real extractions.
              </span>
            </div>
          ) : null}
          {job.error_message ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {job.error_message}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {job.status === "PROCESSING" || running ? "Processing PDF…" : humanize(job.status)}
              </span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">
              {formatNumber(job.patients_processed)} / {formatNumber(job.total_patients_detected)}{" "}
              patient records processed
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Successful" value={job.patients_successful} tone="text-emerald-600" />
            <Stat label="Needs review" value={job.patients_needs_review} tone="text-amber-600" />
            <Stat label="Failed" value={job.patients_failed} tone="text-destructive" />
            <Stat label="Possible duplicates" value={job.duplicates_flagged} tone="text-sky-600" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="records">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="records">Extracted patients</TabsTrigger>
            <TabsTrigger value="errors">Errors ({failedCount})</TabsTrigger>
            <TabsTrigger value="duplicates">Duplicates ({duplicateRecords.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="records" className="mt-4">
          <Card>
            <CardContent className="px-0 pt-6 sm:px-6">
              {recordsLoading ? (
                <div className="space-y-2 px-4 sm:px-0">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : recordsError ? (
                <ErrorState
                  className="mx-4 sm:mx-0"
                  message={recordsError.message}
                  onRetry={onRetryRecords}
                />
              ) : records.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No patient records extracted yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Sex</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Source page</TableHead>
                        <TableHead>Verification</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">
                            {record.patient_identifier ?? "—"}
                            {record.is_possible_duplicate ? (
                              <Copy className="ml-1 inline size-3 text-sky-600" />
                            ) : null}
                          </TableCell>
                          <TableCell>{record.full_name ?? "—"}</TableCell>
                          <TableCell>{record.age ?? "—"}</TableCell>
                          <TableCell>{record.sex ? humanize(record.sex) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(recordStatusTone[record.status])}>
                              {humanize(record.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {record.confidence === null
                              ? "—"
                              : `${Math.round(Number(record.confidence) * 100)}%`}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.page_start ?? "—"}
                            {record.page_end && record.page_end !== record.page_start
                              ? `–${record.page_end}`
                              : ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.status === "VERIFIED"
                              ? `Verified ${formatDateTime(record.verified_at)}`
                              : "Unverified"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={
                                !canManage ||
                                record.status === "VERIFIED" ||
                                record.status === "FAILED"
                              }
                              onClick={() => onVerify(record)}
                            >
                              <CheckCircle2 className="size-4" /> Verify
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <Card>
            <CardContent className="space-y-2 pt-6">
              {records.filter((r) => r.status === "FAILED").length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No failed records — everything processed cleanly.
                </p>
              ) : (
                records
                  .filter((r) => r.status === "FAILED")
                  .map((record) => (
                    <div key={record.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        Segment {record.record_index + 1} · pages {record.page_start ?? "?"}–
                        {record.page_end ?? "?"}
                      </p>
                      <p className="text-destructive">{record.error_message}</p>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="duplicates" className="mt-4">
          <Card>
            <CardContent className="space-y-2 pt-6">
              {duplicateRecords.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No possible duplicates flagged.
                </p>
              ) : (
                duplicateRecords.map((record) => (
                  <div key={record.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      {record.patient_identifier ?? record.full_name ?? "Unidentified patient"}
                    </p>
                    <p className="text-muted-foreground">
                      {record.duplicate_reason} — flagged for review, nothing was deleted.
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", tone)}>{formatNumber(value)}</p>
    </div>
  );
}
