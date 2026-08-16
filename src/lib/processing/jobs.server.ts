import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ProcessingJobStatus } from "@/lib/processing/types";

type Client = SupabaseClient<Database>;

/** ProcessingJobService — job lifecycle and progress counters. */
export const ProcessingJobService = {
  async get(supabase: Client, jobId: string) {
    const { data, error } = await supabase
      .from("processing_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Processing job not found");
    return data;
  },

  async update(
    supabase: Client,
    jobId: string,
    patch: Database["public"]["Tables"]["processing_jobs"]["Update"],
  ) {
    const { error } = await supabase.from("processing_jobs").update(patch).eq("id", jobId);
    if (error) throw new Error(error.message);
  },

  async fail(supabase: Client, jobId: string, message: string) {
    await ProcessingJobService.update(supabase, jobId, {
      status: "FAILED",
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  },

  /** Recomputes counters from the record table and settles the final status. */
  async refreshCounters(supabase: Client, jobId: string) {
    const { data: records, error } = await supabase
      .from("processing_patient_records")
      .select("status, is_possible_duplicate")
      .eq("job_id", jobId);
    if (error) throw new Error(error.message);

    const rows = records ?? [];
    const successful = rows.filter((r) => r.status === "EXTRACTED" || r.status === "VERIFIED").length;
    const needsReview = rows.filter((r) => r.status === "NEEDS_REVIEW").length;
    const failed = rows.filter((r) => r.status === "FAILED").length;
    const duplicates = rows.filter((r) => r.is_possible_duplicate).length;

    const { count: pending } = await supabase
      .from("processing_segments")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .in("status", ["PENDING", "PROCESSING"]);

    const remaining = pending ?? 0;
    let status: ProcessingJobStatus = "PROCESSING";
    if (remaining === 0) {
      if (failed > 0 && successful + needsReview > 0) status = "PARTIALLY_COMPLETED";
      else if (failed > 0 && successful + needsReview === 0) status = "FAILED";
      else status = "COMPLETED";
    }

    await ProcessingJobService.update(supabase, jobId, {
      status,
      patients_processed: rows.length,
      patients_successful: successful,
      patients_needs_review: needsReview,
      patients_failed: failed,
      duplicates_flagged: duplicates,
      ...(remaining === 0 ? { completed_at: new Date().toISOString() } : {}),
    });

    return { remaining, status, processed: rows.length };
  },
};
