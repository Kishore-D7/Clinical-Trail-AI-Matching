import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  FileText,
  HeartPulse,
  Pencil,
  Pill,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConditionDialog } from "@/components/patients/condition-dialog";
import {
  MeasurementDialog,
  type MeasurementDialogMode,
} from "@/components/patients/measurement-dialog";
import { MedicationDialog } from "@/components/patients/medication-dialog";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import {
  calculateAge,
  extractionTone,
  recordStatusTone,
  type AiExtractionRow,
} from "@/lib/patient-detail";
import {
  METRICS,
  formatDate,
  formatDateTime,
  formatNumber,
  humanize,
  metricMeta,
  verificationTone,
  type ConditionRow,
  type MeasurementMetric,
  type MeasurementRow,
  type MedicationRow,
  type PatientDocumentRow,
  type PatientRow,
  type VerificationStatus,
} from "@/lib/patients";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/patients_/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient record — TrialBridge" },
      {
        name: "description",
        content:
          "Review a participant's conditions, measurements, medications, documents and AI extraction history.",
      },
      { property: "og:title", content: "Patient record — TrialBridge" },
      {
        property: "og:description",
        content: "Verified clinical data and AI extraction provenance for a single participant.",
      },
    ],
  }),
  component: PatientDetailPage,
});

type MergedDocument = {
  id: string;
  file_name: string;
  doc_type: string | null;
  processing_status: string;
  created_at: string;
  origin: "patient_documents" | "documents";
  extra: string | null;
};

function PatientDetailPage() {
  const { patientId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = (currentUser?.roles ?? []).some(
    (role) => role === "ADMIN" || role === "CLINICAL_COORDINATOR",
  );

  const [editOpen, setEditOpen] = useState(false);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<ConditionRow | null>(null);
  const [medicationOpen, setMedicationOpen] = useState(false);
  const [editingMedication, setEditingMedication] = useState<MedicationRow | null>(null);
  const [measurementState, setMeasurementState] = useState<{
    open: boolean;
    metric: MeasurementMetric;
    mode: MeasurementDialogMode;
    measurement: MeasurementRow | null;
  }>({ open: false, metric: "HBA1C", mode: "add", measurement: null });
  const [pendingDelete, setPendingDelete] = useState<{
    table: "patient_conditions" | "patient_medications" | "patient_measurements";
    id: string;
    label: string;
  } | null>(null);

  const patientQuery = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PatientRow | null) ?? null;
    },
  });

  const conditionsQuery = useQuery({
    queryKey: ["patient-conditions", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_conditions")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ConditionRow[];
    },
  });

  const measurementsQuery = useQuery({
    queryKey: ["patient-measurements", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_measurements")
        .select("*")
        .eq("patient_id", patientId)
        .order("measured_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as MeasurementRow[];
    },
  });

  const medicationsQuery = useQuery({
    queryKey: ["patient-medications", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_medications")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as MedicationRow[];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["patient-documents", patientId],
    queryFn: async () => {
      const [patientDocs, docs] = await Promise.all([
        supabase
          .from("patient_documents")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("documents")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
      ]);
      if (patientDocs.error) throw new Error(patientDocs.error.message);
      if (docs.error) throw new Error(docs.error.message);

      const rows: MergedDocument[] = [
        ...((patientDocs.data ?? []) as PatientDocumentRow[]).map((row) => ({
          id: row.id,
          file_name: row.file_name,
          doc_type: row.doc_type,
          processing_status: "STORED",
          created_at: row.created_at,
          origin: "patient_documents" as const,
          extra: row.page_count ? `${row.page_count} pages` : row.storage_path,
        })),
        ...(docs.data ?? []).map((row) => ({
          id: row.id,
          file_name: row.file_name,
          doc_type: row.doc_type,
          processing_status: row.processing_status,
          created_at: row.created_at,
          origin: "documents" as const,
          extra: null,
        })),
      ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      return { rows, sources: (patientDocs.data ?? []) as PatientDocumentRow[] };
    },
  });

  const extractionsQuery = useQuery({
    queryKey: ["patient-extractions", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_ai_extractions")
        .select("*")
        .eq("patient_id", patientId)
        .order("extracted_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AiExtractionRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: NonNullable<typeof pendingDelete>) => {
      const { error } = await supabase.from(target.table).delete().eq("id", target.id);
      if (error) throw error;
      return target;
    },
    onSuccess: (target) => {
      toast.success(`${target.label} deleted`);
      queryClient.invalidateQueries({ queryKey: ["patient-conditions", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-medications", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-measurements", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setPendingDelete(null);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to delete this record."
          : (error.message ?? "Could not delete the record"),
      );
    },
  });

  const patient = patientQuery.data ?? null;
  const documents = documentsQuery.data?.sources ?? [];

  const openMeasurement = (
    metric: MeasurementMetric,
    mode: MeasurementDialogMode,
    measurement: MeasurementRow | null,
  ) => setMeasurementState({ open: true, metric, mode, measurement });

  if (patientQuery.isLoading) return <DetailSkeleton />;

  if (patientQuery.isError) {
    return (
      <ErrorState
        message={(patientQuery.error as Error).message}
        onRetry={() => patientQuery.refetch()}
      />
    );
  }

  if (!patient) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Patient not found</CardTitle>
          <CardDescription>
            This record may have been deleted or you may not have access to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/patients">
              <ArrowLeft className="size-4" /> Back to patients
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const age = calculateAge(patient.date_of_birth, patient.age);
  const measurements = measurementsQuery.data ?? [];
  const overallVerification: VerificationStatus = measurements.length
    ? measurements.every((m) => m.verification_status !== "UNVERIFIED")
      ? measurements.some((m) => m.verification_status === "CORRECTED")
        ? "CORRECTED"
        : "VERIFIED"
      : "UNVERIFIED"
    : "UNVERIFIED";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/patients">
              <ArrowLeft className="size-4" /> Patients
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {patient.full_name || patient.patient_code}
          </h1>
          <p className="text-sm text-muted-foreground">
            {patient.patient_code} · {humanize(patient.sex)} · {age ?? "—"} yrs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={overallVerification} />
          <Button
            variant="outline"
            size="sm"
            disabled={!canManage}
            title={canManage ? undefined : "Requires coordinator or administrator access"}
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4" /> Edit patient
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="medications">Medications</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="extractions">AI Extraction History</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>Core demographics and record provenance.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Patient ID" value={patient.patient_code} />
              <Field label="Name" value={patient.full_name || "—"} />
              <Field label="Date of birth" value={formatDate(patient.date_of_birth)} />
              <Field label="Age" value={age === null ? "—" : `${age} years`} />
              <Field label="Sex" value={humanize(patient.sex)} />
              <Field label="Created" value={formatDateTime(patient.created_at)} />
              <Field label="Record status" value={humanize(patient.status)} />
              <Field label="Primary condition" value={patient.primary_condition || "—"} />
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Verification status
                </p>
                <StatusBadge status={overallVerification} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conditions */}
        <TabsContent value="conditions" className="mt-4">
          <SectionCard
            title="Conditions"
            description="Diagnoses recorded for this participant."
            action={
              <Button
                size="sm"
                disabled={!canManage}
                title={canManage ? undefined : "Requires coordinator or administrator access"}
                onClick={() => {
                  setEditingCondition(null);
                  setConditionOpen(true);
                }}
              >
                <Plus className="size-4" /> Add condition
              </Button>
            }
          >
            {conditionsQuery.isLoading ? (
              <RowsSkeleton columns={5} />
            ) : conditionsQuery.isError ? (
              <ErrorState
                message={(conditionsQuery.error as Error).message}
                onRetry={() => conditionsQuery.refetch()}
              />
            ) : (conditionsQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={<HeartPulse className="size-5" />}
                title="No conditions recorded"
                description="Add a diagnosis to describe this participant's clinical picture."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Condition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Diagnosed</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(conditionsQuery.data ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(recordStatusTone[row.status] ?? "")}
                          >
                            {humanize(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(row.diagnosed_on)}</TableCell>
                        <TableCell className="max-w-64 truncate" title={row.notes ?? ""}>
                          {row.notes || "—"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit condition"
                            disabled={!canManage}
                            onClick={() => {
                              setEditingCondition(row);
                              setConditionOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete condition"
                            className="text-destructive"
                            disabled={!canManage}
                            onClick={() =>
                              setPendingDelete({
                                table: "patient_conditions",
                                id: row.id,
                                label: row.name,
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Measurements */}
        <TabsContent value="measurements" className="mt-4 space-y-4">
          {measurementsQuery.isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <RowsSkeleton columns={6} />
              </CardContent>
            </Card>
          ) : measurementsQuery.isError ? (
            <Card>
              <CardContent className="pt-6">
                <ErrorState
                  message={(measurementsQuery.error as Error).message}
                  onRetry={() => measurementsQuery.refetch()}
                />
              </CardContent>
            </Card>
          ) : (
            METRICS.map((metric) => {
              const rows = measurements.filter((m) => m.metric === metric.key);
              return (
                <SectionCard
                  key={metric.key}
                  title={metric.label}
                  description={`Recorded in ${metric.unit || "—"}`}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage}
                      title={canManage ? undefined : "Requires coordinator or administrator access"}
                      onClick={() => openMeasurement(metric.key, "add", null)}
                    >
                      <Plus className="size-4" /> Add
                    </Button>
                  }
                >
                  {rows.length === 0 ? (
                    <EmptyState
                      icon={<Activity className="size-5" />}
                      title={`No ${metric.label} readings`}
                      description="Add a manual reading or import one from a source document."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Value</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Measured</TableHead>
                            <TableHead>Source document</TableHead>
                            <TableHead>Page</TableHead>
                            <TableHead>Origin</TableHead>
                            <TableHead>Original AI value</TableHead>
                            <TableHead>Verification</TableHead>
                            <TableHead>Verified by</TableHead>
                            <TableHead>Verified at</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">
                                {formatNumber(row.value, 2)}
                              </TableCell>
                              <TableCell>{row.unit || metricMeta(row.metric).unit}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatDate(row.measured_on)}
                              </TableCell>
                              <TableCell
                                className="max-w-48 truncate"
                                title={
                                  documents.find((d) => d.id === row.source_document_id)
                                    ?.file_name ?? ""
                                }
                              >
                                {documents.find((d) => d.id === row.source_document_id)
                                  ?.file_name ?? "—"}
                              </TableCell>
                              <TableCell>{row.source_page ?? "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="gap-1">
                                  {row.source === "AI" ? (
                                    <Sparkles className="size-3" />
                                  ) : (
                                    <Pencil className="size-3" />
                                  )}
                                  {row.source === "AI" ? "AI" : "Manual"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {row.original_value === null
                                  ? "—"
                                  : formatNumber(row.original_value, 2)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={row.verification_status} />
                              </TableCell>
                              <TableCell className="max-w-32 truncate">
                                {row.verified_by ?? "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatDateTime(row.verified_at)}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Verify measurement"
                                  disabled={
                                    !canManage || row.verification_status === "VERIFIED"
                                  }
                                  onClick={() => openMeasurement(row.metric, "verify", row)}
                                >
                                  <BadgeCheck className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Correct measurement"
                                  disabled={!canManage}
                                  onClick={() => openMeasurement(row.metric, "correct", row)}
                                >
                                  <Wrench className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Edit measurement"
                                  disabled={!canManage}
                                  onClick={() => openMeasurement(row.metric, "edit", row)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete measurement"
                                  className="text-destructive"
                                  disabled={!canManage}
                                  onClick={() =>
                                    setPendingDelete({
                                      table: "patient_measurements",
                                      id: row.id,
                                      label: `${metric.label} reading`,
                                    })
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </SectionCard>
              );
            })
          )}
        </TabsContent>

        {/* Medications */}
        <TabsContent value="medications" className="mt-4">
          <SectionCard
            title="Medications"
            description="Current and past therapies."
            action={
              <Button
                size="sm"
                disabled={!canManage}
                title={canManage ? undefined : "Requires coordinator or administrator access"}
                onClick={() => {
                  setEditingMedication(null);
                  setMedicationOpen(true);
                }}
              >
                <Plus className="size-4" /> Add medication
              </Button>
            }
          >
            {medicationsQuery.isLoading ? (
              <RowsSkeleton columns={6} />
            ) : medicationsQuery.isError ? (
              <ErrorState
                message={(medicationsQuery.error as Error).message}
                onRetry={() => medicationsQuery.refetch()}
              />
            ) : (medicationsQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={<Pill className="size-5" />}
                title="No medications recorded"
                description="Track therapies to support eligibility screening."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medication</TableHead>
                      <TableHead>Dosage</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(medicationsQuery.data ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.dosage || "—"}</TableCell>
                        <TableCell>{row.frequency || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(recordStatusTone[row.status] ?? "")}
                          >
                            {humanize(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(row.started_on)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit medication"
                            disabled={!canManage}
                            onClick={() => {
                              setEditingMedication(row);
                              setMedicationOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete medication"
                            className="text-destructive"
                            disabled={!canManage}
                            onClick={() =>
                              setPendingDelete({
                                table: "patient_medications",
                                id: row.id,
                                label: row.name,
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-4">
          <SectionCard title="Documents" description="Uploads and processing pipeline records.">
            {documentsQuery.isLoading ? (
              <RowsSkeleton columns={5} />
            ) : documentsQuery.isError ? (
              <ErrorState
                message={(documentsQuery.error as Error).message}
                onRetry={() => documentsQuery.refetch()}
              />
            ) : (documentsQuery.data?.rows ?? []).length === 0 ? (
              <EmptyState
                icon={<FileText className="size-5" />}
                title="No documents"
                description="Uploaded source files will appear here once available."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Processing status</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(documentsQuery.data?.rows ?? []).map((row) => (
                      <TableRow key={`${row.origin}-${row.id}`}>
                        <TableCell className="font-medium">{row.file_name}</TableCell>
                        <TableCell>{row.doc_type ? humanize(row.doc_type) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{humanize(row.processing_status)}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(row.created_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.origin === "documents" ? "Processing pipeline" : "Patient upload"}
                          {row.extra ? ` · ${row.extra}` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* AI extraction history */}
        <TabsContent value="extractions" className="mt-4">
          <SectionCard
            title="AI extraction history"
            description="Every extraction run performed for this participant."
          >
            {extractionsQuery.isLoading ? (
              <RowsSkeleton columns={5} />
            ) : extractionsQuery.isError ? (
              <ErrorState
                message={(extractionsQuery.error as Error).message}
                onRetry={() => extractionsQuery.refetch()}
              />
            ) : (extractionsQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={<BrainCircuit className="size-5" />}
                title="No extraction runs"
                description="AI extractions will be logged here with full provenance."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Extracted at</TableHead>
                      <TableHead>Source document</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Fields extracted</TableHead>
                      <TableHead>Verification outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(extractionsQuery.data ?? []).map((run) => {
                      const doc = documents.find((d) => d.id === run.document_id);
                      const related = measurements.filter(
                        (m) => m.source === "AI" && m.source_document_id === run.document_id,
                      );
                      const verified = related.filter(
                        (m) => m.verification_status === "VERIFIED",
                      ).length;
                      const corrected = related.filter(
                        (m) => m.verification_status === "CORRECTED",
                      ).length;
                      return (
                        <TableRow key={run.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDateTime(run.extracted_at)}
                          </TableCell>
                          <TableCell className="max-w-48 truncate">
                            {doc?.file_name ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(extractionTone[run.status])}>
                              {humanize(run.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-64">
                            {run.fields_extracted.length ? (
                              <span className="flex flex-wrap gap-1">
                                {run.fields_extracted.map((field) => (
                                  <Badge key={field} variant="secondary">
                                    {humanize(field)}
                                  </Badge>
                                ))}
                              </span>
                            ) : (
                              `${run.field_count} fields`
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {run.error_message
                              ? run.error_message
                              : related.length === 0
                                ? "—"
                                : `${verified} verified · ${corrected} corrected · ${
                                    related.length - verified - corrected
                                  } pending`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["patient", patientId] });
          queryClient.invalidateQueries({ queryKey: ["patients"] });
        }}
      />

      <ConditionDialog
        open={conditionOpen}
        onOpenChange={setConditionOpen}
        patientId={patientId}
        condition={editingCondition}
      />

      <MedicationDialog
        open={medicationOpen}
        onOpenChange={setMedicationOpen}
        patientId={patientId}
        medication={editingMedication}
      />

      <MeasurementDialog
        open={measurementState.open}
        onOpenChange={(open) => setMeasurementState((prev) => ({ ...prev, open }))}
        patientId={patientId}
        metric={measurementState.metric}
        mode={measurementState.mode}
        measurement={measurementState.measurement}
        documents={documents}
        userId={currentUser?.id ?? null}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the record from the patient chart. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge variant="outline" className={cn(verificationTone[status])}>
      {humanize(status)}
    </Badge>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

function RowsSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, row) => (
        <div key={row} className="flex gap-3">
          {Array.from({ length: columns }).map((__, cell) => (
            <Skeleton key={cell} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <Card>
        <CardContent className="grid gap-6 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-36" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        {icon}
      </span>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <h3 className="text-sm font-semibold">Something went wrong</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  );
}
