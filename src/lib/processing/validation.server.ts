import type { PatientExtraction } from "@/lib/processing/ai.server";
import type { ExtractedFields, ProcessingRecordStatus } from "@/lib/processing/types";

/** PatientValidationService — sanity checks on AI output; never rewrites clinical values. */
export type ValidationOutcome = {
  status: ProcessingRecordStatus;
  issues: string[];
  confidence: number | null;
  age: number | null;
  dateOfBirth: string | null;
  identifier: string | null;
  name: string | null;
  sex: string | null;
};

const RANGES: Record<string, [number, number]> = {
  hba1c: [3, 20],
  bmi: [8, 90],
  fastingGlucose: [20, 900],
  systolic: [50, 300],
  diastolic: [20, 200],
  ldl: [10, 500],
  egfr: [1, 200],
};

function normalizeSex(value: string | null | undefined) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (["m", "male"].includes(v)) return "MALE";
  if (["f", "female"].includes(v)) return "FEMALE";
  if (!v) return null;
  return "OTHER";
}

export const PatientValidationService = {
  validate(extraction: PatientExtraction, fields: ExtractedFields): ValidationOutcome {
    const issues: string[] = [];

    const identifier =
      extraction.patientId === null || extraction.patientId === undefined
        ? null
        : String(extraction.patientId).trim() || null;
    const name = extraction.name?.trim() || null;

    const ageRaw = typeof extraction.age === "string" ? Number(extraction.age) : extraction.age;
    let age: number | null = typeof ageRaw === "number" && Number.isFinite(ageRaw) ? ageRaw : null;
    if (age !== null && (age < 0 || age > 120)) {
      issues.push(`Age out of plausible range (${age})`);
      age = null;
    }

    let dateOfBirth: string | null = null;
    if (extraction.dateOfBirth) {
      const parsed = new Date(extraction.dateOfBirth);
      if (Number.isNaN(parsed.getTime())) issues.push("Date of birth could not be parsed");
      else dateOfBirth = parsed.toISOString().slice(0, 10);
    }

    for (const [key, field] of Object.entries(fields)) {
      const numeric = typeof field.value === "number" ? field.value : Number(field.value);
      const range = RANGES[key];
      if (range && Number.isFinite(numeric) && (numeric < range[0] || numeric > range[1])) {
        issues.push(`${key} value ${numeric} is outside the expected range`);
      }
      if (field.confidence !== null && field.confidence < 0.6) {
        issues.push(`Low confidence for ${key}`);
      }
    }

    if (!identifier && !name) issues.push("No patient identifier or name found");
    if (Object.keys(fields).length === 0) issues.push("No clinical measurements found");

    const confidences = Object.values(fields)
      .map((f) => f.confidence)
      .filter((c): c is number => typeof c === "number");
    const confidence = confidences.length
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : null;

    return {
      status: issues.length > 0 ? "NEEDS_REVIEW" : "EXTRACTED",
      issues,
      confidence,
      age,
      dateOfBirth,
      identifier,
      name,
      sex: normalizeSex(extraction.sex),
    };
  },

  /** Duplicate detection — flags only, never deletes. */
  duplicateReason(
    candidate: {
      identifier: string | null;
      name: string | null;
      dateOfBirth: string | null;
      age?: number | null;
      sex?: string | null;
    },
    existing: {
      identifier: string | null;
      name: string | null;
      dateOfBirth: string | null;
      age?: number | null;
      sex?: string | null;
    },
  ): string | null {
    const norm = (v: string | null | undefined) => v?.trim().toLowerCase() ?? null;
    if (candidate.identifier && norm(candidate.identifier) === norm(existing.identifier)) {
      return "Same patient identifier";
    }
    if (
      candidate.name &&
      norm(candidate.name) === norm(existing.name) &&
      candidate.dateOfBirth &&
      candidate.dateOfBirth === existing.dateOfBirth
    ) {
      return "Same name and date of birth";
    }
    // Weaker signal: identical date of birth plus matching demographics.
    if (
      candidate.dateOfBirth &&
      candidate.dateOfBirth === existing.dateOfBirth &&
      norm(candidate.sex) === norm(existing.sex) &&
      (candidate.age ?? null) === (existing.age ?? null)
    ) {
      return "Same date of birth, sex and age";
    }
    return null;
  },
};

