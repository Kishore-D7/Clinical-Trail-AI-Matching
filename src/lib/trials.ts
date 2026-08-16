import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

export type TrialRow = Database["public"]["Tables"]["clinical_trials"]["Row"];
export type TrialStatus = Database["public"]["Enums"]["trial_status"];
export type CriterionRow = Database["public"]["Tables"]["trial_criteria"]["Row"];
export type CriterionType = Database["public"]["Enums"]["criterion_type"];

export const TRIAL_STATUSES: TrialStatus[] = [
  "DRAFT",
  "RECRUITING",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CLOSED",
];

export const TRIAL_PHASES = ["PHASE_1", "PHASE_2", "PHASE_3", "PHASE_4", "NA"] as const;

export const phaseLabel = (phase: string | null | undefined) => {
  if (!phase) return "—";
  if (phase === "NA") return "N/A";
  return phase.replace("PHASE_", "Phase ");
};

export const trialStatusTone: Record<TrialStatus, string> = {
  DRAFT: "border-muted-foreground/30 bg-muted text-muted-foreground",
  RECRUITING: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  ACTIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PAUSED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  COMPLETED: "border-primary/40 bg-primary/10 text-primary",
  CLOSED: "border-destructive/40 bg-destructive/10 text-destructive",
};

export const CRITERION_TYPES: CriterionType[] = ["INCLUSION", "EXCLUSION"];

export const CRITERION_OPERATORS = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "BETWEEN",
  "CONTAINS",
  "IN",
] as const;

export type CriterionOperator = (typeof CRITERION_OPERATORS)[number];

export const CRITERION_FIELD_SUGGESTIONS = [
  "Age",
  "Sex",
  "HbA1c",
  "BMI",
  "Fasting Glucose",
  "Systolic BP",
  "Diastolic BP",
  "LDL",
  "eGFR",
  "Condition",
  "Medication",
];

export function criterionExpression(criterion: {
  field: string;
  operator: string;
  value: string;
  value_secondary?: string | null;
  unit?: string | null;
}) {
  const unit = criterion.unit ? ` ${criterion.unit}` : "";
  if (criterion.operator === "BETWEEN") {
    return `${criterion.field} between ${criterion.value} and ${criterion.value_secondary ?? "?"}${unit}`;
  }
  if (criterion.operator === "CONTAINS" || criterion.operator === "IN") {
    return `${criterion.field} ${criterion.operator.toLowerCase()} ${criterion.value}${unit}`;
  }
  return `${criterion.field} ${criterion.operator} ${criterion.value}${unit}`;
}

const optionalDate = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), { message: "Enter a valid date" });

export const trialBasicsSchema = z.object({
  trial_code: z
    .string()
    .trim()
    .min(2, { message: "Trial code must be at least 2 characters" })
    .max(40, { message: "Trial code must be under 40 characters" })
    .regex(/^[A-Za-z0-9._-]+$/, { message: "Use letters, numbers, dots, dashes or underscores" }),
  title: z.string().trim().min(3, { message: "Trial name is required" }).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  sponsor: z.string().trim().max(120).optional().or(z.literal("")),
  phase: z.enum(TRIAL_PHASES),
  condition: z.string().trim().max(120).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "RECRUITING", "ACTIVE", "PAUSED", "COMPLETED", "CLOSED"]),
  nct_id: z.string().trim().max(40).optional().or(z.literal("")),
  start_date: optionalDate,
  end_date: optionalDate,
});

export const trialSchema = trialBasicsSchema.refine(
  (data) => !data.start_date || !data.end_date || new Date(data.end_date) >= new Date(data.start_date),
  { message: "End date must be after the start date", path: ["end_date"] },
);

export type TrialFormValues = z.infer<typeof trialBasicsSchema>;

export const criterionSchema = z
  .object({
    criterion_type: z.enum(["INCLUSION", "EXCLUSION"]),
    field: z.string().trim().min(1, { message: "Field is required" }).max(80),
    operator: z.enum(CRITERION_OPERATORS),
    value: z.string().trim().min(1, { message: "Value is required" }).max(120),
    value_secondary: z.string().trim().max(120).optional().or(z.literal("")),
    unit: z.string().trim().max(24).optional().or(z.literal("")),
    description: z.string().trim().max(300).optional().or(z.literal("")),
    required: z.boolean(),
  })
  .refine((data) => data.operator !== "BETWEEN" || Boolean(data.value_secondary), {
    message: "Provide the upper bound for a range",
    path: ["value_secondary"],
  });

export type CriterionFormValues = z.infer<typeof criterionSchema>;

export function humanizeType(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
