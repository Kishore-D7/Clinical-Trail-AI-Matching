import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, humanize } from "@/lib/patients";
import {
  asExtractedFields,
  DEFAULT_CONFIDENCE_THRESHOLD,
  MEASUREMENT_FIELDS,
  MEASUREMENT_FIELD_META,
  recordStatusTone,
  type ExtractedFieldValue,
  type ExtractedFields,
  type MeasurementFieldKey,
  type ProcessingJobRow,
  type ProcessingRecordRow,
  type ProcessingRecordStatus,
} from "@/lib/processing/types";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/routes/_authenticated/patients";

export const Route = createFileRoute("/_authenticated/patient-processing_/$jobId/review")({
  head: () => ({
    meta: [
      { title: "Patient Extraction Review — TrialBridge" },
      {
        name: "description",
        content:
          "Verify AI-extracted patient records field by field with source evidence, confidence scores and bulk review tools before they become trusted data.",
      },
      { property: "og:title", content: "Patient Extraction Review — TrialBridge" },
      {
        property: "og:description",
        content: "Field-level verification of AI-extracted patient records with source evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

type FilterKey = "all" | "low" | "missing" | "failed" | "duplicates" | "unverified";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All records" },
  { key: "unverified", label: "Not yet verified" },
  { key: "low", label: "Low confidence" },
  { key: "missing", label: "Missing values" },
  { key: "failed", label: "Failed extractions" },
  { key: "duplicates", label: "Duplicate candidates" },
];

function confidenceOf(record: ProcessingRecordRow) {
  return record.confidence === null ? null : Number(record.confidence);
}

function fieldEntries(record: ProcessingRecordRow) {
  const fields = asExtractedFields(record.fields);
  return MEASUREMENT_FIELDS.map((key) => ({
    key,
    meta: MEASUREMENT_FIELD_META[key],
    field: (fields[key] ?? null) as ExtractedFieldValue | null,
  }));
}

function hasMissingValues(record: ProcessingRecordRow) {
  const entries = fieldEntries(record);
  const missingMeasure = entries.some((e) => !e.field || e.field.value === null);
  return (
    missingMeasure ||
    !record.full_name ||
    !record.patient_identifier ||
    record.age === null ||
    !record.sex
  );
}

function isLowConfidence(record: ProcessingRecordRow, threshold: number) {
  const overall = confidenceOf(record);
  if (overall !== null && overall < threshold) return true;
  return fieldEntries(record).some(
    (e) => e.field && e.field.value !== null && (e.field.confidence ?? 0) < threshold,
  );
}

function ReviewPage() {
  const { jobId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = (currentUser?.roles ?? []).length > 0;

  const [threshold, setThreshold] = useState(DEFAULT_CONFIDENCE_THRESHOLD);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProcessingRecordRow | null>(null);

  const jobQuery = useQuery({
    queryKey: ["processing-job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processing_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ProcessingJobRow | null;
    },
  });

  const recordsQuery = useQuery({
    queryKey: ["processing-records", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processing_patient_records")
        .select("*")
        .eq("job_id", jobId)
        .order("record_index", { ascending: true })
        .limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []) as ProcessingRecordRow[];
    },
  });

  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (term) {
        const haystack = [record.patient_identifier, record.full_name, record.sex]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      switch (filter) {
        case "low":
          return isLowConfidence(record, threshold);
        case "missing":
          return hasMissingValues(record);
        case "failed":
          return record.status === "FAILED";
        case "duplicates":
          return record.is_possible_duplicate;
        case "unverified":
          return record.status !== "VERIFIED" && record.status !== "REJECTED";
        default:
          return true;
      }
    });
  }, [records, filter, search, threshold]);

  const active = records.find((r) => r.id === activeId) ?? filtered[0] ?? null;

  async function currentUserId() {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["processing-records", jobId] }),
      queryClient.invalidateQueries({ queryKey: ["processing-jobs"] }),
    ]);

  const statusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ProcessingRecordStatus }) => {
      const userId = status === "VERIFIED" ? await currentUserId() : null;
      const { error } = await supabase
        .from("processing_patient_records")
        .update({
          status,
          verified_by: status === "VERIFIED" ? userId : null,
          verified_at: status === "VERIFIED" ? new Date().toISOString() : null,
        })
        .in("id", ids);
      if (error) throw new Error(error.message);
      return ids.length;
    },
    onSuccess: async (count, variables) => {
      await invalidate();
      setSelected(new Set());
      toast.success(`${count} record${count === 1 ? "" : "s"} marked ${humanize(variables.status)}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fieldMutation = useMutation({
    mutationFn: async ({
      record,
      key,
      next,
      correction,
    }: {
      record: ProcessingRecordRow;
      key: MeasurementFieldKey;
      next: ExtractedFieldValue["verificationStatus"];
      correction?: { value: number | null; unit: string | null };
    }) => {
      const fields: ExtractedFields = { ...asExtractedFields(record.fields) };
      const existing = fields[key] ?? {
        value: null,
        unit: null,
        confidence: null,
        sourcePage: null,
        sourceText: null,
        verificationStatus: "UNVERIFIED" as const,
      };
      fields[key] = {
        ...existing,
        value: correction ? correction.value : existing.value,
        unit: correction ? correction.unit : existing.unit,
        verificationStatus: next,
      };
      const { error } = await supabase
        .from("processing_patient_records")
        .update({
          fields: fields as unknown as ProcessingRecordRow["fields"],
          status: correction
            ? "CORRECTED"
            : record.status === "EXTRACTED" || record.status === "NEEDS_REVIEW"
              ? record.status
              : record.status,
        })
        .eq("id", record.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Field updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editMutation = useMutation({
    mutationFn: async (values: {
      id: string;
      patient_identifier: string | null;
      full_name: string | null;
      age: number | null;
      sex: string | null;
      date_of_birth: string | null;
    }) => {
      const { id, ...rest } = values;
      const { error } = await supabase
        .from("processing_patient_records")
        .update({ ...rest, status: "CORRECTED" })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      toast.success("Patient details corrected");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const counts = {
    total: records.length,
    verified: records.filter((r) => r.status === "VERIFIED").length,
    corrected: records.filter((r) => r.status === "CORRECTED").length,
    needsReview: records.filter((r) => r.status === "NEEDS_REVIEW").length,
    rejected: records.filter((r) => r.status === "REJECTED").length,
    low: records.filter((r) => isLowConfidence(r, threshold)).length,
  };

  const selectedIds = [...selected];
  const busy = statusMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/patient-processing">
              <ArrowLeft className="size-4" /> Back to processing
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Patient Extraction Review</h1>
          <p className="text-sm text-muted-foreground">
            {jobQuery.data
              ? `${jobQuery.data.file_name} · uploaded ${formatDateTime(jobQuery.data.created_at)}`
              : "Verify extracted records against their source evidence."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{counts.total} records</Badge>
          <Badge variant="outline" className={recordStatusTone.VERIFIED}>
            {counts.verified} verified
          </Badge>
          <Badge variant="outline" className={recordStatusTone.CORRECTED}>
            {counts.corrected} corrected
          </Badge>
          <Badge variant="outline" className={recordStatusTone.NEEDS_REVIEW}>
            {counts.needsReview} needs review
          </Badge>
          <Badge variant="outline" className={recordStatusTone.REJECTED}>
            {counts.rejected} rejected
          </Badge>
        </div>
      </div>

      {jobQuery.data?.is_mock ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            These records came from the mock development extractor — treat every value as unverified
            sample data.
          </span>
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Review filters</CardTitle>
          <CardDescription>
            AI extractions are never auto-verified. {counts.low} record
            {counts.low === 1 ? "" : "s"} fall below the confidence threshold.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_240px_260px]">
            <Input
              placeholder="Search by patient ID or name…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={filter} onValueChange={(value) => setFilter(value as FilterKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Confidence threshold — {Math.round(threshold * 100)}%
              </Label>
              <Slider
                value={[threshold * 100]}
                min={50}
                max={100}
                step={5}
                onValueChange={([value]) => setThreshold((value ?? 80) / 100)}
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              aria-label="Select all filtered records"
              disabled={filtered.length === 0}
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.length} selected of {filtered.length} shown
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!canManage || busy || selectedIds.length === 0}
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "VERIFIED" })}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Verify selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canManage || busy || selectedIds.length === 0}
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "NEEDS_REVIEW" })}
              >
                <AlertTriangle className="size-4" /> Needs review
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canManage || busy || selectedIds.length === 0}
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "REJECTED" })}
              >
                <XCircle className="size-4" /> Reject
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {recordsQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full" />
            ))
          ) : recordsQuery.isError ? (
            <ErrorState
              message={(recordsQuery.error as Error).message}
              onRetry={() => recordsQuery.refetch()}
            />
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No records match this filter.
              </CardContent>
            </Card>
          ) : (
            filtered.map((record) => (
              <RecordCard
                key={record.id}
                record={record}
                threshold={threshold}
                canManage={canManage}
                selected={selected.has(record.id)}
                isActive={active?.id === record.id}
                onSelectToggle={() => toggleOne(record.id)}
                onFocus={() => setActiveId(record.id)}
                onEdit={() => setEditing(record)}
                onStatus={(status) => statusMutation.mutate({ ids: [record.id], status })}
                onField={(key, next, correction) =>
                  fieldMutation.mutate({ record, key, next, correction })
                }
              />
            ))
          )}
        </div>

        <SourcePanel job={jobQuery.data ?? null} record={active} loading={jobQuery.isLoading} />
      </div>

      <EditRecordDialog
        record={editing}
        saving={editMutation.isPending}
        onClose={() => setEditing(null)}
        onSave={(values) => editMutation.mutate(values)}
      />
    </div>
  );
}

function ConfidenceBadge({ value, threshold }: { value: number | null; threshold: number }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const low = value < threshold;
  return (
    <Badge
      variant="outline"
      className={cn(
        low
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {Math.round(value * 100)}%
    </Badge>
  );
}

function RecordCard({
  record,
  threshold,
  canManage,
  selected,
  isActive,
  onSelectToggle,
  onFocus,
  onEdit,
  onStatus,
  onField,
}: {
  record: ProcessingRecordRow;
  threshold: number;
  canManage: boolean;
  selected: boolean;
  isActive: boolean;
  onSelectToggle: () => void;
  onFocus: () => void;
  onEdit: () => void;
  onStatus: (status: ProcessingRecordStatus) => void;
  onField: (
    key: MeasurementFieldKey,
    next: ExtractedFieldValue["verificationStatus"],
    correction?: { value: number | null; unit: string | null },
  ) => void;
}) {
  const entries = fieldEntries(record);

  return (
    <Card
      onClick={onFocus}
      className={cn("transition", isActive && "border-primary/60 ring-1 ring-primary/20")}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onSelectToggle}
            aria-label="Select record"
            className="mt-1"
          />
          <div className="space-y-1">
            <CardTitle className="text-base">
              {record.full_name ?? "Unnamed patient"}{" "}
              <span className="text-muted-foreground">
                · {record.patient_identifier ?? "no ID"}
              </span>
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
              <span>Age {record.age ?? "—"}</span>
              <span>Sex {record.sex ? humanize(record.sex) : "—"}</span>
              <span>DOB {record.date_of_birth ?? "—"}</span>
              <span>
                Pages {record.page_start ?? "?"}
                {record.page_end && record.page_end !== record.page_start
                  ? `–${record.page_end}`
                  : ""}
              </span>
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record.is_possible_duplicate ? (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <Copy className="mr-1 size-3" /> Possible duplicate
            </Badge>
          ) : null}
          <ConfidenceBadge value={confidenceOf(record)} threshold={threshold} />
          <Badge variant="outline" className={cn(recordStatusTone[record.status])}>
            {humanize(record.status)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {record.status === "FAILED" && record.error_message ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {record.error_message}
          </div>
        ) : null}
        {record.is_possible_duplicate && record.duplicate_reason ? (
          <p className="text-sm text-muted-foreground">{record.duplicate_reason}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Conditions</p>
            <p className="text-sm">
              {(record.conditions ?? []).length > 0 ? record.conditions.join(", ") : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Medications</p>
            <p className="text-sm">
              {(record.medications ?? []).length > 0 ? record.medications.join(", ") : "—"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Clinical measurements & source evidence
          </p>
          <div className="divide-y rounded-md border">
            {entries.map(({ key, meta, field }) => (
              <FieldRow
                key={key}
                fieldKey={key}
                label={meta.label}
                fallbackUnit={meta.unit}
                field={field}
                threshold={threshold}
                canManage={canManage}
                onField={onField}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!canManage || record.status === "VERIFIED"}
            onClick={() => onStatus("VERIFIED")}
          >
            <CheckCircle2 className="size-4" /> Verify patient
          </Button>
          <Button size="sm" variant="outline" disabled={!canManage} onClick={onEdit}>
            <Pencil className="size-4" /> Edit patient
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canManage || record.status === "NEEDS_REVIEW"}
            onClick={() => onStatus("NEEDS_REVIEW")}
          >
            <AlertTriangle className="size-4" /> Mark needs review
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canManage || record.status === "REJECTED"}
            onClick={() => onStatus("REJECTED")}
          >
            <XCircle className="size-4" /> Reject extraction
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldRow({
  fieldKey,
  label,
  fallbackUnit,
  field,
  threshold,
  canManage,
  onField,
}: {
  fieldKey: MeasurementFieldKey;
  label: string;
  fallbackUnit: string;
  field: ExtractedFieldValue | null;
  threshold: number;
  canManage: boolean;
  onField: (
    key: MeasurementFieldKey,
    next: ExtractedFieldValue["verificationStatus"],
    correction?: { value: number | null; unit: string | null },
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(field?.value === null ? "" : String(field?.value ?? ""));
  const [unit, setUnit] = useState(field?.unit ?? fallbackUnit);

  const confidence = field?.confidence ?? null;
  const low = field?.value !== null && confidence !== null && confidence < threshold;
  const status = field?.verificationStatus ?? "UNVERIFIED";

  function save() {
    const trimmed = value.trim();
    if (trimmed && Number.isNaN(Number(trimmed))) {
      toast.error("Enter a numeric value");
      return;
    }
    onField(fieldKey, "CORRECTED", {
      value: trimmed === "" ? null : Number(trimmed),
      unit: unit.trim() || null,
    });
    setEditing(false);
  }

  return (
    <div className={cn("space-y-1 p-3 text-sm", low && "bg-amber-500/5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{label}</span>
          {editing ? (
            <>
              <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="h-8 w-24"
                placeholder="value"
              />
              <Input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="h-8 w-28"
                placeholder="unit"
              />
            </>
          ) : (
            <span className="text-muted-foreground">
              {field && field.value !== null
                ? `${field.value}${field.unit ? ` ${field.unit}` : ""}`
                : "Not found in source"}
            </span>
          )}
          {low ? (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              Low confidence
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge value={confidence} threshold={threshold} />
          <Badge variant="outline" className="text-xs">
            {humanize(status)}
          </Badge>
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={save} disabled={!canManage}>
                <Save className="size-4" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canManage || !field || field.value === null || status === "VERIFIED"}
                onClick={() => onField(fieldKey, "VERIFIED")}
              >
                <CheckCircle2 className="size-4" /> Verify
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canManage}
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" /> Correct
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Source: {field?.sourcePage ? `Page ${field.sourcePage}` : "no page recorded"}
        {field?.sourceText ? ` · “${field.sourceText}”` : ""}
      </p>
    </div>
  );
}

function SourcePanel({
  job,
  record,
  loading,
}: {
  job: ProcessingJobRow | null;
  record: ProcessingRecordRow | null;
  loading: boolean;
}) {
  const [opening, setOpening] = useState(false);

  async function openDocument() {
    if (!job?.storage_path) return;
    setOpening(true);
    try {
      const { data, error } = await supabase.storage
        .from("patient-documents")
        .createSignedUrl(job.storage_path, 300);
      if (error) throw new Error(error.message);
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the source document");
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card className="h-fit xl:sticky xl:top-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> Source viewer
        </CardTitle>
        <CardDescription>Evidence behind the selected record.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Document</p>
              <p className="break-words font-medium">{job?.file_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pages</p>
              <p>
                {record?.page_start ?? "—"}
                {record?.page_end && record.page_end !== record.page_start
                  ? `–${record.page_end}`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Extracted text
              </p>
              <pre className="mt-1 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
                {record?.source_text?.trim() || "Select a record to see its source text."}
              </pre>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!job?.storage_path || opening}
              onClick={openDocument}
            >
              {opening ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Open source PDF
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EditRecordDialog({
  record,
  saving,
  onClose,
  onSave,
}: {
  record: ProcessingRecordRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: {
    id: string;
    patient_identifier: string | null;
    full_name: string | null;
    age: number | null;
    sex: string | null;
    date_of_birth: string | null;
  }) => void;
}) {
  const [form, setForm] = useState({
    patient_identifier: "",
    full_name: "",
    age: "",
    sex: "",
    date_of_birth: "",
  });
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (record && record.id !== loadedId) {
    setLoadedId(record.id);
    setForm({
      patient_identifier: record.patient_identifier ?? "",
      full_name: record.full_name ?? "",
      age: record.age === null ? "" : String(record.age),
      sex: record.sex ?? "",
      date_of_birth: record.date_of_birth ?? "",
    });
  }

  return (
    <Dialog open={Boolean(record)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit extracted patient</DialogTitle>
          <DialogDescription>
            Corrections are saved against the extraction record and marked as corrected.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-id">Patient ID</Label>
            <Input
              id="edit-id"
              value={form.patient_identifier}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, patient_identifier: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={form.full_name}
              onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-age">Age</Label>
              <Input
                id="edit-age"
                inputMode="numeric"
                value={form.age}
                onChange={(event) => setForm((prev) => ({ ...prev, age: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-sex">Sex</Label>
              <Input
                id="edit-sex"
                value={form.sex}
                onChange={(event) => setForm((prev) => ({ ...prev, sex: event.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-dob">Date of birth</Label>
            <Input
              id="edit-dob"
              type="date"
              value={form.date_of_birth}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, date_of_birth: event.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !record}
            onClick={() => {
              if (!record) return;
              const age = form.age.trim();
              if (age && !/^\d{1,3}$/.test(age)) {
                toast.error("Age must be a whole number");
                return;
              }
              onSave({
                id: record.id,
                patient_identifier: form.patient_identifier.trim() || null,
                full_name: form.full_name.trim() || null,
                age: age ? Number(age) : null,
                sex: form.sex.trim() ? form.sex.trim().toUpperCase() : null,
                date_of_birth: form.date_of_birth || null,
              });
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
