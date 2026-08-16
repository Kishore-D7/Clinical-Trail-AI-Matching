import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_SOURCE_TEXT, responseToCriteria, type ExtractionResult } from "@/lib/ai-criteria";

type ExtractInput = {
  trialId: string;
  text: string;
  sourceType: "TEXT" | "FILE";
  sourceName?: string | undefined;
};

export const extractTrialCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ExtractInput) => {
    if (!input?.trialId) throw new Error("A trial is required");
    const text = (input.text ?? "").trim();
    if (text.length < 20) throw new Error("Provide at least 20 characters of eligibility text");
    return {
      trialId: input.trialId,
      text: text.slice(0, MAX_SOURCE_TEXT),
      sourceType: input.sourceType === "FILE" ? ("FILE" as const) : ("TEXT" as const),
      sourceName: input.sourceName?.slice(0, 200) ?? null,
    };
  })
  .handler(async ({ data, context }): Promise<ExtractionResult> => {
    const { supabase, userId } = context;

    const { data: run, error: insertError } = await supabase
      .from("trial_criteria_extractions")
      .insert({
        trial_id: data.trialId,
        source_type: data.sourceType,
        source_name: data.sourceName,
        source_text: data.text,
        status: "PROCESSING",
        created_by: userId,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    const { AIService } = await import("@/lib/ai-criteria.server");

    try {
      const outcome = await AIService.extractCriteria(data.text);
      const criteria = responseToCriteria(outcome.response);

      await supabase
        .from("trial_criteria_extractions")
        .update({
          status: "COMPLETED",
          provider: outcome.provider,
          model: outcome.model,
          is_mock: outcome.isMock,
          raw_response: outcome.raw as never,
          notes: outcome.response.notes,
          criteria_count: criteria.length,
        })
        .eq("id", run.id);

      return {
        extractionId: run.id,
        provider: outcome.provider,
        model: outcome.model,
        isMock: outcome.isMock,
        notes: outcome.response.notes,
        criteria,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      await supabase
        .from("trial_criteria_extractions")
        .update({ status: "FAILED", error_message: message })
        .eq("id", run.id);
      throw new Error(message);
    }
  });

type ConfirmInput = {
  extractionId: string;
  trialId: string;
  criteria: {
    criterion_type: "INCLUSION" | "EXCLUSION";
    field: string;
    operator: string;
    value: string;
    value_secondary?: string | undefined;
    unit?: string | undefined;
    description?: string | undefined;
    required: boolean;
  }[];
};

export const confirmExtractedCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ConfirmInput) => {
    if (!input?.extractionId || !input?.trialId) throw new Error("Missing extraction context");
    if (!Array.isArray(input.criteria) || input.criteria.length === 0) {
      throw new Error("Confirm at least one criterion");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const rows = data.criteria.map((c) => ({
      trial_id: data.trialId,
      criterion_type: c.criterion_type,
      field: c.field,
      operator: c.operator,
      value: c.value,
      value_secondary: c.value_secondary || null,
      unit: c.unit || null,
      description: c.description || null,
      required: c.required,
      created_by: userId,
    }));

    const { error } = await supabase.from("trial_criteria").insert(rows);
    if (error) throw new Error(error.message);

    await supabase
      .from("trial_criteria_extractions")
      .update({
        status: "CONFIRMED",
        confirmed_criteria: data.criteria as never,
        confirmed_at: new Date().toISOString(),
        confirmed_by: userId,
        criteria_count: rows.length,
      })
      .eq("id", data.extractionId);

    return { inserted: rows.length };
  });

export const discardExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { extractionId: string }) => {
    if (!input?.extractionId) throw new Error("Missing extraction");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trial_criteria_extractions")
      .update({ status: "DISCARDED" })
      .eq("id", data.extractionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
