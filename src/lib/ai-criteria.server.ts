import {
  extractionResponseSchema,
  type ExtractionResponse,
} from "@/lib/ai-criteria";

export type AIExtractionOutcome = {
  provider: string;
  model: string;
  isMock: boolean;
  raw: unknown;
  response: ExtractionResponse;
};

const SYSTEM_PROMPT = `You convert unstructured clinical trial eligibility criteria into structured JSON.

Rules:
- Extract ONLY information explicitly present in the source text. Never invent criteria.
- Preserve numerical values and units exactly as written.
- Distinguish inclusion criteria from exclusion criteria.
- Convert natural-language comparisons into one of these operators: =, !=, >, >=, <, <=, BETWEEN, CONTAINS, IN.
- For BETWEEN, put the lower bound in "value" and the upper bound in "value_secondary".
- List any missing, ambiguous or unparseable criteria in "notes".
- Return valid JSON only, matching the requested schema. No prose, no markdown fences.`;

const JSON_SHAPE = `{
  "inclusion": [{ "field": "age", "operator": ">=", "value": 18, "value_secondary": null, "unit": "years", "description": "..." }],
  "exclusion": [{ "field": "egfr", "operator": "<", "value": 30, "value_secondary": null, "unit": "mL/min/1.73m2", "description": "..." }],
  "notes": ["..."]
}`;

/**
 * MOCK IMPLEMENTATION — used only when no AI provider is configured.
 * Every criterion returned here is clearly marked as mock development data.
 */
function mockExtract(text: string): AIExtractionOutcome {
  const lower = text.toLowerCase();
  const inclusion: ExtractionResponse["inclusion"] = [];
  const exclusion: ExtractionResponse["exclusion"] = [];

  const ageMatch = lower.match(/(?:aged?|age of)\s*(?:>=|at least|over|older than)?\s*(\d{1,3})/);
  if (ageMatch) {
    inclusion.push({
      field: "Age",
      operator: ">=",
      value: Number(ageMatch[1]),
      unit: "years",
      description: "[MOCK DATA] Participant must be at least " + ageMatch[1] + " years old",
    });
  }
  const hba1c = lower.match(/hba1c[^0-9]{0,20}(\d+(?:\.\d+)?)/);
  if (hba1c) {
    inclusion.push({
      field: "HbA1c",
      operator: ">=",
      value: Number(hba1c[1]),
      unit: "%",
      description: "[MOCK DATA] HbA1c at or above " + hba1c[1] + "%",
    });
  }
  const egfr = lower.match(/egfr[^0-9]{0,20}(\d+(?:\.\d+)?)/);
  if (egfr) {
    exclusion.push({
      field: "eGFR",
      operator: "<",
      value: Number(egfr[1]),
      unit: "mL/min/1.73m2",
      description: "[MOCK DATA] eGFR below " + egfr[1] + " is excluded",
    });
  }
  if (inclusion.length === 0 && exclusion.length === 0) {
    inclusion.push({
      field: "Condition",
      operator: "CONTAINS",
      value: text.trim().split(/\s+/).slice(0, 4).join(" ") || "Unspecified",
      unit: "",
      description: "[MOCK DATA] Placeholder criterion — connect a real AI provider to extract properly",
    });
  }

  const response: ExtractionResponse = {
    inclusion,
    exclusion,
    notes: [
      "MOCK DEVELOPMENT DATA: no AI provider is configured, so these criteria were produced by a simple local parser. Review every row before confirming.",
    ],
  };
  return { provider: "mock", model: "mock-rule-based-v1", isMock: true, raw: response, response };
}

async function lovableExtract(text: string, apiKey: string): Promise<AIExtractionOutcome> {
  const model = "google/gemini-3-flash-preview";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the eligibility criteria from the text below into this JSON shape:\n${JSON_SHAPE}\n\n--- SOURCE TEXT ---\n${text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
    throw new Error(`AI provider error (${res.status}): ${detail.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("The AI returned a response that was not valid JSON.");
  }

  const validated = extractionResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("The AI response did not match the expected criteria schema.");
  }

  return { provider: "lovable-ai", model, isMock: false, raw: parsed, response: validated.data };
}

/** Server-side AI service abstraction. Keys are read from env, never sent to the browser. */
export const AIService = {
  async extractCriteria(text: string): Promise<AIExtractionOutcome> {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return mockExtract(text);
    return lovableExtract(text, apiKey);
  },
};
