import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type GenerateInput = {
  trialId: string;
  scope?: string;
  format?: string;
  jobId?: string | null;
  name?: string | null;
  exportId?: string | null;
};

const SCOPES = ["ALL", "POTENTIAL_MATCH", "NEEDS_REVIEW", "INELIGIBLE"] as const;
const FORMATS = ["csv", "json", "xlsx"] as const;

/** Generate (or regenerate) a trial-ready candidate file and store it privately. */
export const generateCandidateExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateInput) => {
    if (!input?.trialId) throw new Error("A trial is required");
    const scope = (input.scope ?? "ALL").toUpperCase();
    const format = (input.format ?? "csv").toLowerCase();
    if (!SCOPES.includes(scope as (typeof SCOPES)[number])) throw new Error("Unsupported export type");
    if (!FORMATS.includes(format as (typeof FORMATS)[number])) throw new Error("Unsupported format");
    return {
      trialId: input.trialId,
      scope: scope as (typeof SCOPES)[number],
      format: format as (typeof FORMATS)[number],
      jobId: input.jobId || null,
      name: input.name?.trim() || null,
      exportId: input.exportId || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { runCandidateExport } = await import("@/lib/exports/run.server");
    return runCandidateExport(context.supabase, context.userId, data);
  });

/** Short-lived signed URL for downloading a stored candidate file. */
export const getCandidateExportUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { exportId: string }) => {
    if (!input?.exportId) throw new Error("An export is required");
    return { exportId: input.exportId };
  })
  .handler(async ({ data, context }) => {
    const { signCandidateExport } = await import("@/lib/exports/run.server");
    return signCandidateExport(context.supabase, data.exportId);
  });

/** Delete an export record and its stored file. */
export const deleteCandidateExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { exportId: string }) => {
    if (!input?.exportId) throw new Error("An export is required");
    return { exportId: input.exportId };
  })
  .handler(async ({ data, context }) => {
    const { removeCandidateExport } = await import("@/lib/exports/run.server");
    return removeCandidateExport(context.supabase, data.exportId);
  });
