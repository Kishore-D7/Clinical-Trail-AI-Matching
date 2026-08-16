import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Run one deterministic matching batch for a trial (no AI involved). */
export const runTrialMatchBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trialId: string; offset?: number }) => {
    if (!input?.trialId) throw new Error("A trial is required");
    const offset = Number(input.offset ?? 0);
    return { trialId: input.trialId, offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0 };
  })
  .handler(async ({ data, context }) => {
    const { runMatchBatch } = await import("@/lib/matching/run.server");
    return runMatchBatch(context.supabase, data.trialId, data.offset);
  });

/** Re-evaluate a single patient against a single trial. */
export const matchPatientToTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trialId: string; patientId: string }) => {
    if (!input?.trialId || !input?.patientId) throw new Error("A trial and a patient are required");
    return { trialId: input.trialId, patientId: input.patientId };
  })
  .handler(async ({ data, context }) => {
    const { matchSinglePatient } = await import("@/lib/matching/single.server");
    return matchSinglePatient(context.supabase, data.trialId, data.patientId);
  });
