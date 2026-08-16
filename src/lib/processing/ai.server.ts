import { z } from "zod";

import type { ExtractedFields } from "@/lib/processing/types";

/**
 * AIExtractionService — sends ONE patient segment at a time to the AI.
 * API keys are read from server env and never reach the browser.
 */

const fieldValue = z
  .union([
    z.number(),
    z.string(),
    z.null(),
    z.object({
      value: z.union([z.number(), z.string(), z.null()]).nullable().optional(),
      unit: z.string().nullable().optional(),
      confidence: z.number().nullable().optional(),
      sourcePage: z.number().nullable().optional(),
      sourceText: z.string().nullable().optional(),
    }),
  ])
  .nullable()
  .optional();

export const patientExtractionSchema = z.object({
  patientId: z.union([z.string(), z.number(), z.null()]).nullable().optional(),
  name: z.string().nullable().optional(),
  age: z.union([z.number(), z.string(), z.null()]).nullable().optional(),
  sex: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  conditions: z.array(z.string()).nullable().optional(),
  medications: z.array(z.string()).nullable().optional(),
  hba1c: fieldValue,
  bmi: fieldValue,
  fastingGlucose: fieldValue,
  systolic: fieldValue,
  diastolic: fieldValue,
  ldl: fieldValue,
  egfr: fieldValue,
  source: z
    .object({
      pageStart: z.number().nullable().optional(),
      pageEnd: z.number().nullable().optional(),
      sourceText: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type PatientExtraction = z.infer<typeof patientExtractionSchema>;

export type PatientExtractionOutcome = {
  provider: string;
  model: string;
  isMock: boolean;
  raw: unknown;
  extraction: PatientExtraction;
};

const SYSTEM_PROMPT = `You extract structured patient data from ONE patient record segment of a clinical PDF.

Hard rules:
- Never invent values. If a value is not explicitly present, return null.
- Preserve units exactly as written in the source.
- Preserve source page information when page markers are present.
- Extract only information present in this segment. Never merge two different patients.
- Do not infer or calculate medical values.
- Return valid JSON only. No prose, no markdown fences.

For each measurement field return an object:
{ "value": number|null, "unit": string|null, "confidence": 0-1, "sourcePage": number|null, "sourceText": string|null }`;

const JSON_SHAPE = `{
  "patientId": null, "name": null, "age": null, "sex": null, "dateOfBirth": null,
  "conditions": [], "medications": [],
  "hba1c": null, "bmi": null, "fastingGlucose": null, "systolic": null, "diastolic": null, "ldl": null, "egfr": null,
  "source": { "pageStart": null, "pageEnd": null, "sourceText": null }
}`;

/**
 * MOCK IMPLEMENTATION — used only when no AI provider is configured.
 * Values come from a simple local regex parser and are clearly flagged as mock.
 */
function mockExtract(segment: string, pageStart: number, pageEnd: number): PatientExtractionOutcome {
  const grab = (pattern: RegExp) => segment.match(pattern)?.[1]?.trim() ?? null;
  const num = (pattern: RegExp) => {
    const raw = grab(pattern);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const measure = (value: number | null, unit: string | null, text: string | null) =>
    value === null
      ? null
      : { value, unit, confidence: 0.4, sourcePage: pageStart, sourceText: text };

  const extraction: PatientExtraction = {
    patientId: grab(/(?:patient\s*id|mrn|record\s*id)\s*[:#-]\s*([A-Za-z0-9._-]+)/i),
    name: grab(/(?:patient\s*name|name)\s*[:#-]\s*([A-Za-z][A-Za-z .'-]{1,60})/i),
    age: num(/age\s*[:#-]?\s*(\d{1,3})/i),
    sex: grab(/\b(?:sex|gender)\s*[:#-]?\s*(male|female|m|f|other)\b/i),
    dateOfBirth: grab(/(?:dob|date of birth)\s*[:#-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i),
    conditions: [],
    medications: [],
    hba1c: measure(num(/hba1c[^0-9]{0,20}(\d+(?:\.\d+)?)/i), "%", "[MOCK] parsed locally"),
    bmi: measure(num(/bmi[^0-9]{0,20}(\d+(?:\.\d+)?)/i), "kg/m2", "[MOCK] parsed locally"),
    fastingGlucose: measure(
      num(/fasting\s*glucose[^0-9]{0,20}(\d+(?:\.\d+)?)/i),
      "mg/dL",
      "[MOCK] parsed locally",
    ),
    systolic: measure(num(/(\d{2,3})\s*\/\s*\d{2,3}\s*mmhg/i), "mmHg", "[MOCK] parsed locally"),
    diastolic: measure(num(/\d{2,3}\s*\/\s*(\d{2,3})\s*mmhg/i), "mmHg", "[MOCK] parsed locally"),
    ldl: measure(num(/ldl[^0-9]{0,20}(\d+(?:\.\d+)?)/i), "mg/dL", "[MOCK] parsed locally"),
    egfr: measure(num(/egfr[^0-9]{0,20}(\d+(?:\.\d+)?)/i), "mL/min/1.73m2", "[MOCK] parsed locally"),
    source: { pageStart, pageEnd, sourceText: segment.slice(0, 500) },
  };

  return {
    provider: "mock",
    model: "mock-rule-based-v1",
    isMock: true,
    raw: extraction,
    extraction,
  };
}

async function lovableExtract(
  segment: string,
  pageStart: number,
  pageEnd: number,
  apiKey: string,
): Promise<PatientExtractionOutcome> {
  const model = "google/gemini-3-flash-preview";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Return this JSON shape:\n${JSON_SHAPE}\n\nThis segment covers pages ${pageStart}-${pageEnd}.\n\n--- PATIENT SEGMENT ---\n${segment}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Retry in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
    throw new Error(`AI provider error (${res.status}): ${detail.slice(0, 160)}`);
  }

  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = (payload.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The AI returned a response that was not valid JSON.");
  }
  const validated = patientExtractionSchema.safeParse(parsed);
  if (!validated.success) throw new Error("The AI response did not match the patient schema.");

  return { provider: "lovable-ai", model, isMock: false, raw: parsed, extraction: validated.data };
}

export const AIExtractionService = {
  isConfigured() {
    return Boolean(process.env["LOVABLE_API_KEY"]);
  },
  async extractPatient(
    segment: string,
    pageStart: number,
    pageEnd: number,
  ): Promise<PatientExtractionOutcome> {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return mockExtract(segment, pageStart, pageEnd);
    return lovableExtract(segment, pageStart, pageEnd, apiKey);
  },
};

export function toExtractedFields(
  extraction: PatientExtraction,
  fallbackPage: number,
): ExtractedFields {
  const fields: ExtractedFields = {};
  const keys = [
    "hba1c",
    "bmi",
    "fastingGlucose",
    "systolic",
    "diastolic",
    "ldl",
    "egfr",
  ] as const;
  for (const key of keys) {
    const raw = extraction[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "number" || typeof raw === "string") {
      fields[key] = {
        value: raw,
        unit: null,
        confidence: null,
        sourcePage: fallbackPage,
        sourceText: null,
        verificationStatus: "UNVERIFIED",
      };
      continue;
    }
    if (raw.value === null || raw.value === undefined) continue;
    fields[key] = {
      value: raw.value,
      unit: raw.unit ?? null,
      confidence: raw.confidence ?? null,
      sourcePage: raw.sourcePage ?? fallbackPage,
      sourceText: raw.sourceText ?? null,
      verificationStatus: "UNVERIFIED",
    };
  }
  return fields;
}
