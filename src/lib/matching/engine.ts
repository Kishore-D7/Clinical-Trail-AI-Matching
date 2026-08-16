/**
 * Deterministic Clinical Trial Matching Engine.
 *
 * Pure functions only — no AI, no network. The LLM is never allowed to decide
 * eligibility; it may only produce structured criteria, which this engine
 * evaluates against structured patient data.
 */

import type { Database } from "@/integrations/supabase/types";

export type CriterionResult = "PASS" | "FAIL" | "UNKNOWN";
export type MatchStatus = "POTENTIAL_MATCH" | "NEEDS_REVIEW" | "INELIGIBLE";
export type CriterionType = Database["public"]["Enums"]["criterion_type"];

export type EngineCriterion = {
  id: string;
  criterion_type: CriterionType;
  field: string;
  operator: string;
  value: string;
  value_secondary?: string | null;
  unit?: string | null;
  description?: string | null;
  required: boolean;
};

export type PatientFacts = {
  id: string;
  patient_code: string;
  full_name: string | null;
  age: number | null;
  sex: string | null;
  conditions: string[];
  medications: string[];
  measurements: Partial<Record<CanonicalNumericField, number>>;
};

export type CanonicalNumericField =
  | "age"
  | "hba1c"
  | "bmi"
  | "fasting_glucose"
  | "systolic"
  | "diastolic"
  | "ldl"
  | "egfr";

export type CriterionEvaluation = {
  criterionId: string;
  criterionType: CriterionType;
  field: string;
  operator: string;
  required: boolean;
  actualValue: string | null;
  expectedValue: string;
  unit: string | null;
  result: CriterionResult;
  reason: string;
};

export type MatchEvaluation = {
  patientId: string;
  trialId: string;
  status: MatchStatus;
  /** Criteria Match Score — NOT a medical probability or eligibility percentage. */
  score: number;
  summary: string;
  totals: { total: number; passed: number; failed: number; unknown: number };
  results: CriterionEvaluation[];
};

export const matchStatusTone: Record<MatchStatus, string> = {
  POTENTIAL_MATCH: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  NEEDS_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  INELIGIBLE: "border-destructive/40 bg-destructive/10 text-destructive",
};

export const criterionResultTone: Record<CriterionResult, string> = {
  PASS: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  FAIL: "border-destructive/40 bg-destructive/10 text-destructive",
  UNKNOWN: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export const matchStatusLabel: Record<MatchStatus, string> = {
  POTENTIAL_MATCH: "Potential match",
  NEEDS_REVIEW: "Needs review",
  INELIGIBLE: "Ineligible",
};

const NUMERIC_ALIASES: Record<string, CanonicalNumericField> = {
  age: "age",
  years: "age",
  hba1c: "hba1c",
  a1c: "hba1c",
  "hemoglobin a1c": "hba1c",
  "haemoglobin a1c": "hba1c",
  bmi: "bmi",
  "body mass index": "bmi",
  "fasting glucose": "fasting_glucose",
  fastingglucose: "fasting_glucose",
  fasting_glucose: "fasting_glucose",
  glucose: "fasting_glucose",
  systolic: "systolic",
  "systolic bp": "systolic",
  "systolic blood pressure": "systolic",
  sbp: "systolic",
  diastolic: "diastolic",
  "diastolic bp": "diastolic",
  "diastolic blood pressure": "diastolic",
  dbp: "diastolic",
  ldl: "ldl",
  "ldl cholesterol": "ldl",
  egfr: "egfr",
  gfr: "egfr",
};

const CONDITION_ALIASES = new Set([
  "condition",
  "conditions",
  "diagnosis",
  "diagnoses",
  "comorbidity",
  "comorbidities",
  "medical history",
]);

const MEDICATION_ALIASES = new Set([
  "medication",
  "medications",
  "medicine",
  "drug",
  "drugs",
  "therapy",
  "treatment",
]);

const SEX_ALIASES = new Set(["sex", "gender"]);

export type FieldKind =
  | { kind: "numeric"; key: CanonicalNumericField }
  | { kind: "list"; key: "conditions" | "medications" }
  | { kind: "sex" }
  | { kind: "unsupported" };

export function resolveField(field: string): FieldKind {
  const normalized = field.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const compact = normalized.replace(/\s+/g, "");
  const numeric = NUMERIC_ALIASES[normalized] ?? NUMERIC_ALIASES[compact];
  if (numeric) return { kind: "numeric", key: numeric };
  if (CONDITION_ALIASES.has(normalized)) return { kind: "list", key: "conditions" };
  if (MEDICATION_ALIASES.has(normalized)) return { kind: "list", key: "medications" };
  if (SEX_ALIASES.has(normalized)) return { kind: "sex" };
  return { kind: "unsupported" };
}

export const MEASUREMENT_METRIC_TO_FIELD: Record<string, CanonicalNumericField> = {
  HBA1C: "hba1c",
  BMI: "bmi",
  FASTING_GLUCOSE: "fasting_glucose",
  SYSTOLIC_BP: "systolic",
  DIASTOLIC_BP: "diastolic",
  LDL: "ldl",
  EGFR: "egfr",
};

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[^0-9.+-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function splitList(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function norm(value: string) {
  return value.trim().toLowerCase();
}

export function expectedValueText(criterion: EngineCriterion) {
  const unit = criterion.unit ? ` ${criterion.unit}` : "";
  if (criterion.operator === "BETWEEN") {
    return `${criterion.value}–${criterion.value_secondary ?? "?"}${unit}`;
  }
  if (criterion.operator === "CONTAINS" || criterion.operator === "IN") {
    return `${criterion.operator.toLowerCase()} ${criterion.value}`;
  }
  return `${criterion.operator} ${criterion.value}${unit}`;
}

function compareNumeric(
  actual: number,
  criterion: EngineCriterion,
): { result: CriterionResult; reason: string } {
  const target = toNumber(criterion.value);
  const upper = toNumber(criterion.value_secondary ?? null);
  const op = criterion.operator;

  if (op === "BETWEEN") {
    if (target === null || upper === null) {
      return { result: "UNKNOWN", reason: "Criterion range is incomplete" };
    }
    const low = Math.min(target, upper);
    const high = Math.max(target, upper);
    const pass = actual >= low && actual <= high;
    return {
      result: pass ? "PASS" : "FAIL",
      reason: `${actual} ${pass ? "is" : "is not"} between ${low} and ${high}`,
    };
  }

  if (op === "IN" || op === "CONTAINS") {
    const options = splitList(criterion.value).map((item) => toNumber(item));
    if (options.length === 0) return { result: "UNKNOWN", reason: "Criterion value list is empty" };
    const pass = options.some((option) => option !== null && option === actual);
    return {
      result: pass ? "PASS" : "FAIL",
      reason: `${actual} ${pass ? "is" : "is not"} in ${criterion.value}`,
    };
  }

  if (target === null) {
    return { result: "UNKNOWN", reason: "Criterion value is not numeric" };
  }

  let pass: boolean;
  switch (op) {
    case "=":
      pass = actual === target;
      break;
    case "!=":
      pass = actual !== target;
      break;
    case ">":
      pass = actual > target;
      break;
    case ">=":
      pass = actual >= target;
      break;
    case "<":
      pass = actual < target;
      break;
    case "<=":
      pass = actual <= target;
      break;
    default:
      return { result: "UNKNOWN", reason: `Unsupported operator "${op}"` };
  }
  return { result: pass ? "PASS" : "FAIL", reason: `${actual} ${op} ${target} is ${pass}` };
}

function compareList(
  values: string[],
  criterion: EngineCriterion,
): { result: CriterionResult; reason: string } {
  if (values.length === 0) {
    return { result: "UNKNOWN", reason: "No data recorded for this patient" };
  }
  const haystack = values.map(norm);
  const targets = splitList(criterion.value).map(norm);
  if (targets.length === 0) return { result: "UNKNOWN", reason: "Criterion value is empty" };

  const matches = (target: string) =>
    haystack.some((item) => item === target || item.includes(target) || target.includes(item));

  const op = criterion.operator;
  if (op === "!=") {
    const hit = targets.some(matches);
    return {
      result: hit ? "FAIL" : "PASS",
      reason: hit ? `Patient record includes ${criterion.value}` : `Not present in patient record`,
    };
  }
  // =, CONTAINS, IN all mean "one of the listed values is present"
  const hit = targets.some(matches);
  return {
    result: hit ? "PASS" : "FAIL",
    reason: hit ? `Matched "${criterion.value}"` : `"${criterion.value}" not found in patient record`,
  };
}

function compareSex(
  actual: string,
  criterion: EngineCriterion,
): { result: CriterionResult; reason: string } {
  const value = norm(actual);
  const targets = splitList(criterion.value).map(norm);
  if (targets.length === 0) return { result: "UNKNOWN", reason: "Criterion value is empty" };
  const hit = targets.includes(value);
  if (criterion.operator === "!=") {
    return { result: hit ? "FAIL" : "PASS", reason: `Sex is ${actual}` };
  }
  return { result: hit ? "PASS" : "FAIL", reason: `Sex is ${actual}` };
}

/** Evaluate one criterion against one patient. Missing data is always UNKNOWN. */
export function evaluateCriterion(
  patient: PatientFacts,
  criterion: EngineCriterion,
): CriterionEvaluation {
  const field = resolveField(criterion.field);
  const base = {
    criterionId: criterion.id,
    criterionType: criterion.criterion_type,
    field: criterion.field,
    operator: criterion.operator,
    required: criterion.required,
    expectedValue: expectedValueText(criterion),
    unit: criterion.unit ?? null,
  };

  if (field.kind === "unsupported") {
    return {
      ...base,
      actualValue: null,
      result: "UNKNOWN",
      reason: `No structured patient data mapped to "${criterion.field}"`,
    };
  }

  if (field.kind === "numeric") {
    const actual = field.key === "age" ? patient.age : (patient.measurements[field.key] ?? null);
    if (actual === null || actual === undefined) {
      return {
        ...base,
        actualValue: null,
        result: "UNKNOWN",
        reason: "Value not recorded for this patient",
      };
    }
    const outcome = compareNumeric(actual, criterion);
    return { ...base, actualValue: String(actual), ...outcome };
  }

  if (field.kind === "sex") {
    if (!patient.sex) {
      return { ...base, actualValue: null, result: "UNKNOWN", reason: "Sex not recorded" };
    }
    const outcome = compareSex(patient.sex, criterion);
    return { ...base, actualValue: patient.sex, ...outcome };
  }

  const values = field.key === "conditions" ? patient.conditions : patient.medications;
  const outcome = compareList(values, criterion);
  return {
    ...base,
    actualValue: values.length ? values.join("; ") : null,
    ...outcome,
  };
}

/** Evaluate a full patient/trial pair deterministically. */
export function evaluateMatch(
  patient: PatientFacts,
  trialId: string,
  criteria: EngineCriterion[],
): MatchEvaluation {
  const results = criteria.map((criterion) => evaluateCriterion(patient, criterion));

  const inclusion = results.filter((r) => r.criterionType === "INCLUSION");
  const exclusion = results.filter((r) => r.criterionType === "EXCLUSION");

  const failedRequiredInclusion = inclusion.filter((r) => r.required && r.result === "FAIL");
  const triggeredExclusion = exclusion.filter((r) => r.result === "PASS");
  const requiredUnknown = results.filter((r) => r.required && r.result === "UNKNOWN");

  // "Applicable" = criteria the engine could actually decide on.
  const applicable = results.filter((r) => r.result !== "UNKNOWN");
  const satisfied = applicable.filter((r) =>
    r.criterionType === "INCLUSION" ? r.result === "PASS" : r.result === "FAIL",
  );
  const score = applicable.length === 0 ? 0 : Math.round((satisfied.length / applicable.length) * 100);

  let status: MatchStatus;
  if (failedRequiredInclusion.length > 0 || triggeredExclusion.length > 0) {
    status = "INELIGIBLE";
  } else if (requiredUnknown.length > 0) {
    status = "NEEDS_REVIEW";
  } else {
    status = "POTENTIAL_MATCH";
  }

  const summaryParts: string[] = [];
  if (failedRequiredInclusion.length > 0) {
    summaryParts.push(
      `Failed required inclusion: ${failedRequiredInclusion.map((r) => r.field).join(", ")}`,
    );
  }
  if (triggeredExclusion.length > 0) {
    summaryParts.push(`Exclusion triggered: ${triggeredExclusion.map((r) => r.field).join(", ")}`);
  }
  if (requiredUnknown.length > 0) {
    summaryParts.push(`Missing data: ${requiredUnknown.map((r) => r.field).join(", ")}`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push(
      criteria.length === 0
        ? "Trial has no structured criteria defined"
        : "All required inclusion criteria passed, no exclusion triggered",
    );
  }

  return {
    patientId: patient.id,
    trialId,
    status,
    score,
    summary: summaryParts.join(" · "),
    totals: {
      total: results.length,
      passed: satisfied.length,
      failed: results.filter((r) =>
        r.criterionType === "INCLUSION" ? r.result === "FAIL" : r.result === "PASS",
      ).length,
      unknown: results.filter((r) => r.result === "UNKNOWN").length,
    },
    results,
  };
}
