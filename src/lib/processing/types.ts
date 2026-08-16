import type { Database } from "@/integrations/supabase/types";

export type ProcessingJobRow = Database["public"]["Tables"]["processing_jobs"]["Row"];
export type ProcessingRecordRow =
  Database["public"]["Tables"]["processing_patient_records"]["Row"];
export type ProcessingJobStatus = Database["public"]["Enums"]["processing_job_status"];
export type ProcessingRecordStatus = Database["public"]["Enums"]["processing_record_status"];

export const PATIENT_DOCUMENTS_BUCKET = "patient-documents";

/** Upload validation limits (shared by client and server). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
export const ACCEPTED_MIME = "application/pdf";

/** Chunking configuration — tunable without touching the pipeline code. */
export type ChunkConfig = {
  /** Target characters per chunk sent for segmentation. */
  chunkSize: number;
  /** Characters of overlap between chunks so a patient split across a boundary is not lost. */
  chunkOverlap: number;
  /** Hard cap on characters of a single patient segment sent to the AI. */
  maxSegmentChars: number;
};

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  chunkSize: 6000,
  chunkOverlap: 400,
  maxSegmentChars: 6000,
};

/** How many patient segments are extracted per batch request. */
export const SEGMENTS_PER_BATCH = 5;

export type ExtractedFieldValue = {
  value: number | string | null;
  unit: string | null;
  confidence: number | null;
  sourcePage: number | null;
  sourceText: string | null;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "CORRECTED";
};

export type ExtractedFields = Record<string, ExtractedFieldValue>;

export const MEASUREMENT_FIELDS = [
  "hba1c",
  "bmi",
  "fastingGlucose",
  "systolic",
  "diastolic",
  "ldl",
  "egfr",
] as const;

export type MeasurementFieldKey = (typeof MEASUREMENT_FIELDS)[number];

export const MEASUREMENT_FIELD_META: Record<
  MeasurementFieldKey,
  { label: string; unit: string }
> = {
  hba1c: { label: "HbA1c", unit: "%" },
  bmi: { label: "BMI", unit: "kg/m²" },
  fastingGlucose: { label: "Fasting Glucose", unit: "mg/dL" },
  systolic: { label: "Systolic BP", unit: "mmHg" },
  diastolic: { label: "Diastolic BP", unit: "mmHg" },
  ldl: { label: "LDL", unit: "mg/dL" },
  egfr: { label: "eGFR", unit: "mL/min/1.73m²" },
};

/** Default confidence below which a field is highlighted for review. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

export const recordStatusTone: Record<ProcessingRecordStatus, string> = {
  EXTRACTED: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  NEEDS_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
  VERIFIED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CORRECTED: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  REJECTED: "border-muted-foreground/30 bg-muted text-muted-foreground line-through",
};


export const jobStatusTone: Record<ProcessingJobStatus, string> = {
  UPLOADED: "border-muted-foreground/30 bg-muted text-muted-foreground",
  QUEUED: "border-muted-foreground/30 bg-muted text-muted-foreground",
  PROCESSING: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PARTIALLY_COMPLETED:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function jobProgress(job: Pick<ProcessingJobRow, "total_patients_detected" | "patients_processed">) {
  if (!job.total_patients_detected) return 0;
  return Math.min(100, Math.round((job.patients_processed / job.total_patients_detected) * 100));
}

export function asExtractedFields(value: unknown): ExtractedFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ExtractedFields;
}

export function validatePdfFile(file: { type: string; size: number; name: string }) {
  if (file.type !== ACCEPTED_MIME && !file.name.toLowerCase().endsWith(".pdf")) {
    return "Only PDF files are supported.";
  }
  if (file.size <= 0) return "The file appears to be empty.";
  if (file.size > MAX_PDF_BYTES) return "PDF is larger than the 50 MB limit.";
  return null;
}
