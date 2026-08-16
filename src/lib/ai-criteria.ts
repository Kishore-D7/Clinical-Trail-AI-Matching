import { z } from "zod";

import { CRITERION_OPERATORS, type CriterionFormValues } from "@/lib/trials";

export const OPERATOR_SYNONYMS: Record<string, string> = {
  "greater than or equal to": ">=",
  "at least": ">=",
  "minimum": ">=",
  "greater than": ">",
  "less than or equal to": "<=",
  "at most": "<=",
  "maximum": "<=",
  "less than": "<",
  "equals": "=",
  "equal to": "=",
  "not equal to": "!=",
  "between": "BETWEEN",
  "contains": "CONTAINS",
  "in": "IN",
};

export const extractedCriterionSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  value_secondary: z.union([z.string(), z.number()]).nullish(),
  unit: z.string().nullish(),
  description: z.string().nullish(),
});

export const extractionResponseSchema = z.object({
  inclusion: z.array(extractedCriterionSchema).default([]),
  exclusion: z.array(extractedCriterionSchema).default([]),
  notes: z.array(z.string()).default([]),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

export type ExtractionResult = {
  extractionId: string;
  provider: string;
  model: string;
  isMock: boolean;
  notes: string[];
  criteria: CriterionFormValues[];
};

export function normalizeOperator(raw: string): CriterionFormValues["operator"] {
  const trimmed = raw.trim();
  if ((CRITERION_OPERATORS as readonly string[]).includes(trimmed.toUpperCase())) {
    return trimmed.toUpperCase() as CriterionFormValues["operator"];
  }
  if ((CRITERION_OPERATORS as readonly string[]).includes(trimmed)) {
    return trimmed as CriterionFormValues["operator"];
  }
  const mapped = OPERATOR_SYNONYMS[trimmed.toLowerCase()];
  return (mapped ?? "=") as CriterionFormValues["operator"];
}

export function toCriterionFormValues(
  raw: z.infer<typeof extractedCriterionSchema>,
  type: "INCLUSION" | "EXCLUSION",
): CriterionFormValues {
  const operator = normalizeOperator(raw.operator);
  return {
    criterion_type: type,
    field: String(raw.field).slice(0, 80),
    operator,
    value: String(raw.value).slice(0, 120),
    value_secondary:
      raw.value_secondary === null || raw.value_secondary === undefined
        ? ""
        : String(raw.value_secondary).slice(0, 120),
    unit: (raw.unit ?? "").slice(0, 24),
    description: (raw.description ?? "").slice(0, 300),
    required: true,
  };
}

export function responseToCriteria(response: ExtractionResponse): CriterionFormValues[] {
  return [
    ...response.inclusion.map((c) => toCriterionFormValues(c, "INCLUSION")),
    ...response.exclusion.map((c) => toCriterionFormValues(c, "EXCLUSION")),
  ];
}

export const MAX_SOURCE_TEXT = 40000;
