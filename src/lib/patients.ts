import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

export type MeasurementMetric = Database["public"]["Enums"]["measurement_metric"];
export type VerificationStatus = Database["public"]["Enums"]["verification_status"];
export type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
export type PatientListRow = Database["public"]["Views"]["patient_list_view"]["Row"];
export type ConditionRow = Database["public"]["Tables"]["patient_conditions"]["Row"];
export type MedicationRow = Database["public"]["Tables"]["patient_medications"]["Row"];
export type MeasurementRow = Database["public"]["Tables"]["patient_measurements"]["Row"];
export type PatientDocumentRow = Database["public"]["Tables"]["patient_documents"]["Row"];

export const METRICS: {
  key: MeasurementMetric;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "HBA1C", label: "HbA1c", unit: "%", min: 2, max: 20, step: 0.1 },
  { key: "BMI", label: "BMI", unit: "kg/m²", min: 8, max: 90, step: 0.1 },
  { key: "FASTING_GLUCOSE", label: "Fasting Glucose", unit: "mg/dL", min: 20, max: 800, step: 1 },
  { key: "SYSTOLIC_BP", label: "Systolic BP", unit: "mmHg", min: 50, max: 300, step: 1 },
  { key: "DIASTOLIC_BP", label: "Diastolic BP", unit: "mmHg", min: 20, max: 200, step: 1 },
  { key: "LDL", label: "LDL", unit: "mg/dL", min: 10, max: 500, step: 1 },
  { key: "EGFR", label: "eGFR", unit: "mL/min/1.73m²", min: 1, max: 200, step: 1 },
];

export const metricMeta = (metric: MeasurementMetric) =>
  METRICS.find((m) => m.key === metric) ?? {
    key: metric,
    label: metric,
    unit: "",
    min: 0,
    max: 1000,
    step: 0.01,
  };

export const SEX_OPTIONS = ["FEMALE", "MALE", "OTHER", "UNKNOWN"] as const;
export const CONDITION_STATUS_OPTIONS = ["ACTIVE", "RESOLVED", "IN_REMISSION", "SUSPECTED"] as const;
export const MEDICATION_STATUS_OPTIONS = ["ACTIVE", "DISCONTINUED", "ON_HOLD"] as const;
export const VERIFICATION_OPTIONS: VerificationStatus[] = ["UNVERIFIED", "VERIFIED", "CORRECTED"];

export function humanize(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(value: number | string | null | undefined, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const optionalDate = z
  .string()
  .trim()
  .max(10)
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), { message: "Enter a valid date" })
  .refine((v) => !v || new Date(v) <= new Date(), { message: "Date cannot be in the future" });

export const patientSchema = z
  .object({
    patient_code: z
      .string()
      .trim()
      .min(2, { message: "Patient ID must be at least 2 characters" })
      .max(40, { message: "Patient ID must be under 40 characters" })
      .regex(/^[A-Za-z0-9._-]+$/, {
        message: "Use letters, numbers, dots, dashes or underscores only",
      }),
    full_name: z
      .string()
      .trim()
      .min(2, { message: "Name must be at least 2 characters" })
      .max(120, { message: "Name must be under 120 characters" }),
    sex: z.enum(SEX_OPTIONS, { message: "Select a sex" }),
    date_of_birth: optionalDate,
    age: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || /^\d{1,3}$/.test(v), { message: "Age must be a whole number" })
      .refine((v) => !v || (Number(v) >= 0 && Number(v) <= 120), {
        message: "Age must be between 0 and 120",
      }),
    primary_condition: z.string().trim().max(120).optional().or(z.literal("")),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  })
  .refine((data) => Boolean(data.date_of_birth) || Boolean(data.age), {
    message: "Provide a date of birth or an age",
    path: ["age"],
  });

export type PatientFormValues = z.infer<typeof patientSchema>;

export function measurementSchema(metric: MeasurementMetric) {
  const meta = metricMeta(metric);
  return z.object({
    value: z
      .string()
      .trim()
      .min(1, { message: "Enter a value" })
      .refine((v) => /^-?\d*\.?\d+$/.test(v), { message: "Value must be a number" })
      .refine((v) => Number(v) >= meta.min && Number(v) <= meta.max, {
        message: `Value must be between ${meta.min} and ${meta.max} ${meta.unit}`.trim(),
      }),
    unit: z.string().trim().max(24),
    measured_on: optionalDate,
    source_page: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || /^\d{1,5}$/.test(v), { message: "Page must be a whole number" })
      .refine((v) => !v || Number(v) > 0, { message: "Page must be greater than 0" }),
    source_document_id: z.string().optional(),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
  });
}

export const conditionSchema = z.object({
  name: z.string().trim().min(2, { message: "Condition name is required" }).max(120),
  status: z.enum(CONDITION_STATUS_OPTIONS),
  diagnosed_on: optionalDate,
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const medicationSchema = z.object({
  name: z.string().trim().min(2, { message: "Medication name is required" }).max(120),
  dosage: z.string().trim().max(60).optional().or(z.literal("")),
  frequency: z.string().trim().max(60).optional().or(z.literal("")),
  status: z.enum(MEDICATION_STATUS_OPTIONS),
  started_on: optionalDate,
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const documentSchema = z.object({
  file_name: z.string().trim().min(2, { message: "File name is required" }).max(200),
  doc_type: z.string().trim().max(60).optional().or(z.literal("")),
  page_count: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^\d{1,5}$/.test(v), { message: "Pages must be a whole number" }),
});

export const verificationTone: Record<VerificationStatus, string> = {
  UNVERIFIED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  VERIFIED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CORRECTED: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};
