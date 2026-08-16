import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildCandidateFile, CANDIDATE_EXPORT_BUCKET } from "@/lib/exports/build.server";
import {
  MATCHING_ENGINE_VERSION,
  SCOPE_LABELS,
  type CandidateExportFormat,
  type CandidateExportScope,
} from "@/lib/exports/candidate-file";

type Client = SupabaseClient<Database>;

export type RunExportInput = {
  trialId: string;
  scope: CandidateExportScope;
  format: CandidateExportFormat;
  jobId: string | null;
  name: string | null;
  exportId: string | null;
};

export async function runCandidateExport(supabase: Client, userId: string, input: RunExportInput) {
  const built = await buildCandidateFile(supabase, {
    trialId: input.trialId,
    scope: input.scope,
    format: input.format,
    jobId: input.jobId,
  });

  const storagePath = `${input.trialId}/${built.fileName}`;
  const bytes = new TextEncoder().encode(built.content);
  const { error: uploadError } = await supabase.storage
    .from(CANDIDATE_EXPORT_BUCKET)
    .upload(storagePath, bytes, { contentType: built.mimeType, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const payload = {
    name:
      input.name ??
      `${built.metadata.trialCode} — ${SCOPE_LABELS[input.scope]} (${input.format.toUpperCase()})`,
    trial_id: input.trialId,
    trial_code: built.metadata.trialCode,
    trial_title: built.metadata.trialName,
    job_id: input.jobId,
    scope: input.scope,
    format: input.format,
    status: "READY" as const,
    storage_path: storagePath,
    file_name: built.fileName,
    file_size: bytes.byteLength,
    patient_count: built.counts.total,
    potential_count: built.counts.potential,
    needs_review_count: built.counts.needsReview,
    ineligible_count: built.counts.ineligible,
    engine_version: MATCHING_ENGINE_VERSION,
    metadata: built.metadata as unknown as Database["public"]["Tables"]["candidate_exports"]["Insert"]["metadata"],
    error_message: null,
    generated_at: built.metadata.generatedAt,
    created_by: userId,
  };

  if (input.exportId) {
    const { data: existing } = await supabase
      .from("candidate_exports")
      .select("storage_path")
      .eq("id", input.exportId)
      .maybeSingle();
    if (existing?.storage_path && existing.storage_path !== storagePath) {
      await supabase.storage.from(CANDIDATE_EXPORT_BUCKET).remove([existing.storage_path]);
    }
    const { data, error } = await supabase
      .from("candidate_exports")
      .update(payload)
      .eq("id", input.exportId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: data?.id ?? input.exportId, counts: built.counts };
  }

  const { data, error } = await supabase
    .from("candidate_exports")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { id: data?.id ?? "", counts: built.counts };
}

export async function signCandidateExport(supabase: Client, exportId: string) {
  const { data, error } = await supabase
    .from("candidate_exports")
    .select("storage_path, file_name")
    .eq("id", exportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.storage_path) throw new Error("This export has no stored file yet");
  const signed = await supabase.storage
    .from(CANDIDATE_EXPORT_BUCKET)
    .createSignedUrl(data.storage_path, 300, { download: data.file_name ?? undefined });
  if (signed.error) throw new Error(signed.error.message);
  return { url: signed.data.signedUrl, fileName: data.file_name ?? "candidate-export" };
}

export async function removeCandidateExport(supabase: Client, exportId: string) {
  const { data } = await supabase
    .from("candidate_exports")
    .select("storage_path")
    .eq("id", exportId)
    .maybeSingle();
  if (data?.storage_path) {
    await supabase.storage.from(CANDIDATE_EXPORT_BUCKET).remove([data.storage_path]);
  }
  const { error } = await supabase.from("candidate_exports").delete().eq("id", exportId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
