import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_CHUNK_CONFIG, MAX_PDF_BYTES, SEGMENTS_PER_BATCH } from "@/lib/processing/types";

export type StartJobResult = {
  jobId: string;
  totalPages: number;
  segments: number;
  strategy: string;
};

export type BatchResult = {
  jobId: string;
  processedNow: number;
  remaining: number;
  status: string;
  isMock: boolean;
};

export const createProcessingJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; fileSize: number; storagePath: string }) => {
    if (!input?.storagePath) throw new Error("The uploaded file path is missing");
    if (!input.fileName?.toLowerCase().endsWith(".pdf")) throw new Error("Only PDF files are supported");
    if (!input.fileSize || input.fileSize <= 0) throw new Error("The uploaded file is empty");
    if (input.fileSize > MAX_PDF_BYTES) throw new Error("PDF is larger than the 50 MB limit");
    return {
      fileName: input.fileName.slice(0, 200),
      fileSize: Math.round(input.fileSize),
      storagePath: input.storagePath,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job, error } = await supabase
      .from("processing_jobs")
      .insert({
        file_name: data.fileName,
        file_size: data.fileSize,
        storage_path: data.storagePath,
        status: "UPLOADED",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { jobId: job.id };
  });

export const startProcessingJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => {
    if (!input?.jobId) throw new Error("A job is required");
    return { jobId: input.jobId };
  })
  .handler(async ({ data, context }): Promise<StartJobResult> => {
    const { supabase } = context;
    const { ProcessingJobService } = await import("@/lib/processing/jobs.server");
    const { DocumentService } = await import("@/lib/processing/document.server");
    const { PdfExtractionService } = await import("@/lib/processing/pdf.server");
    const { PatientSegmentationService } = await import("@/lib/processing/segmentation.server");

    const job = await ProcessingJobService.get(supabase, data.jobId);
    if (!job.storage_path) throw new Error("This job has no stored document");

    await ProcessingJobService.update(supabase, job.id, {
      status: "QUEUED",
      started_at: new Date().toISOString(),
      error_message: null,
    });

    try {
      const bytes = await DocumentService.download(supabase, job.storage_path);
      const { totalPages, pages } = await PdfExtractionService.extract(bytes);
      const { segments, strategy } = PatientSegmentationService.segment(pages, DEFAULT_CHUNK_CONFIG);

      if (segments.length === 0) throw new Error("No readable text was found in this PDF");

      await supabase.from("processing_segments").delete().eq("job_id", job.id);
      const chunkSize = 200;
      for (let i = 0; i < segments.length; i += chunkSize) {
        const rows = segments.slice(i, i + chunkSize).map((segment) => ({
          job_id: job.id,
          segment_index: segment.index,
          chunk_index: segment.chunkIndex,
          page_start: segment.pageStart,
          page_end: segment.pageEnd,
          strategy: segment.strategy,
          content: segment.content,
        }));
        const { error } = await supabase.from("processing_segments").insert(rows);
        if (error) throw new Error(error.message);
      }

      await ProcessingJobService.update(supabase, job.id, {
        status: "PROCESSING",
        total_pages: totalPages,
        total_patients_detected: segments.length,
        patients_processed: 0,
        patients_successful: 0,
        patients_needs_review: 0,
        patients_failed: 0,
        duplicates_flagged: 0,
        completed_at: null,
      });

      return { jobId: job.id, totalPages, segments: segments.length, strategy };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Processing failed";
      await ProcessingJobService.fail(supabase, job.id, message);
      throw new Error(message);
    }
  });

export const processJobBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string; batchSize?: number }) => {
    if (!input?.jobId) throw new Error("A job is required");
    return {
      jobId: input.jobId,
      batchSize: Math.min(Math.max(input.batchSize ?? SEGMENTS_PER_BATCH, 1), 10),
    };
  })
  .handler(async ({ data, context }): Promise<BatchResult> => {
    const { supabase } = context;
    const { ProcessingJobService } = await import("@/lib/processing/jobs.server");
    const { AIExtractionService, toExtractedFields } = await import("@/lib/processing/ai.server");
    const { PatientValidationService } = await import("@/lib/processing/validation.server");

    const { data: segments, error: segmentError } = await supabase
      .from("processing_segments")
      .select("*")
      .eq("job_id", data.jobId)
      .eq("status", "PENDING")
      .order("segment_index", { ascending: true })
      .limit(data.batchSize);
    if (segmentError) throw new Error(segmentError.message);

    const batch = segments ?? [];
    if (batch.length === 0) {
      const summary = await ProcessingJobService.refreshCounters(supabase, data.jobId);
      return {
        jobId: data.jobId,
        processedNow: 0,
        remaining: summary.remaining,
        status: summary.status,
        isMock: !AIExtractionService.isConfigured(),
      };
    }

    await supabase
      .from("processing_segments")
      .update({ status: "PROCESSING" })
      .in(
        "id",
        batch.map((segment) => segment.id),
      );

    const { data: existing } = await supabase
      .from("processing_patient_records")
      .select("id, patient_identifier, full_name, date_of_birth, age, sex")
      .eq("job_id", data.jobId)
      .limit(5000);
    const known = (existing ?? []).map((row) => ({
      id: row.id,
      identifier: row.patient_identifier,
      name: row.full_name,
      dateOfBirth: row.date_of_birth,
      age: row.age,
      sex: row.sex,
    }));


    let processedNow = 0;
    let provider: string | null = null;
    let model: string | null = null;
    let isMock = false;

    for (const segment of batch) {
      const pageStart = segment.page_start ?? 1;
      const pageEnd = segment.page_end ?? pageStart;
      try {
        const outcome = await AIExtractionService.extractPatient(
          segment.content,
          pageStart,
          pageEnd,
        );
        provider = outcome.provider;
        model = outcome.model;
        isMock = outcome.isMock;

        const fields = toExtractedFields(outcome.extraction, pageStart);
        const validated = PatientValidationService.validate(outcome.extraction, fields);

        let duplicateOf: string | null = null;
        let duplicateReason: string | null = null;
        for (const candidate of known) {
          const reason = PatientValidationService.duplicateReason(
            {
              identifier: validated.identifier,
              name: validated.name,
              dateOfBirth: validated.dateOfBirth,
            },
            candidate,
          );
          if (reason) {
            duplicateOf = candidate.id;
            duplicateReason = reason;
            break;
          }
        }

        const { data: inserted, error: insertError } = await supabase
          .from("processing_patient_records")
          .insert({
            job_id: data.jobId,
            segment_id: segment.id,
            record_index: segment.segment_index,
            patient_identifier: validated.identifier,
            full_name: validated.name,
            age: validated.age,
            sex: validated.sex,
            date_of_birth: validated.dateOfBirth,
            conditions: outcome.extraction.conditions ?? [],
            medications: outcome.extraction.medications ?? [],
            fields: fields as never,
            raw_response: outcome.raw as never,
            status: duplicateOf ? "NEEDS_REVIEW" : validated.status,
            confidence: validated.confidence,
            page_start: outcome.extraction.source?.pageStart ?? pageStart,
            page_end: outcome.extraction.source?.pageEnd ?? pageEnd,
            source_text: segment.content.slice(0, 4000),
            validation_issues: duplicateReason
              ? [...validated.issues, `Possible duplicate: ${duplicateReason}`]
              : validated.issues,
            is_possible_duplicate: Boolean(duplicateOf),
            duplicate_of: duplicateOf,
            duplicate_reason: duplicateReason,
            provider: outcome.provider,
            model: outcome.model,
            is_mock: outcome.isMock,
          })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);

        known.push({
          id: inserted.id,
          identifier: validated.identifier,
          name: validated.name,
          dateOfBirth: validated.dateOfBirth,
        });

        await supabase
          .from("processing_segments")
          .update({ status: "DONE", attempts: segment.attempts + 1, error_message: null })
          .eq("id", segment.id);
      } catch (error) {
        // One patient failing must never fail the whole job.
        const message = error instanceof Error ? error.message : "Extraction failed";
        await supabase.from("processing_patient_records").insert({
          job_id: data.jobId,
          segment_id: segment.id,
          record_index: segment.segment_index,
          status: "FAILED",
          page_start: pageStart,
          page_end: pageEnd,
          source_text: segment.content.slice(0, 4000),
          error_message: message.slice(0, 500),
        });
        await supabase
          .from("processing_segments")
          .update({
            status: "FAILED",
            attempts: segment.attempts + 1,
            error_message: message.slice(0, 500),
          })
          .eq("id", segment.id);
      }
      processedNow += 1;
    }

    const summary = await ProcessingJobService.refreshCounters(supabase, data.jobId);
    if (provider) {
      await ProcessingJobService.update(supabase, data.jobId, {
        provider,
        model,
        is_mock: isMock,
      });
    }

    return {
      jobId: data.jobId,
      processedNow,
      remaining: summary.remaining,
      status: summary.status,
      isMock: isMock || !AIExtractionService.isConfigured(),
    };
  });

export const retryFailedRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string; recordIds?: string[] }) => {
    if (!input?.jobId) throw new Error("A job is required");
    return { jobId: input.jobId, recordIds: input.recordIds?.slice(0, 500) ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { ProcessingJobService } = await import("@/lib/processing/jobs.server");

    let query = supabase
      .from("processing_patient_records")
      .select("id, segment_id")
      .eq("job_id", data.jobId)
      .eq("status", "FAILED");
    if (data.recordIds) query = query.in("id", data.recordIds);

    const { data: failed, error } = await query;
    if (error) throw new Error(error.message);
    const rows = failed ?? [];
    if (rows.length === 0) return { retried: 0 };

    const segmentIds = rows.map((row) => row.segment_id).filter((id): id is string => Boolean(id));
    if (segmentIds.length > 0) {
      await supabase
        .from("processing_segments")
        .update({ status: "PENDING", error_message: null })
        .in("id", segmentIds);
    }
    await supabase
      .from("processing_patient_records")
      .delete()
      .in(
        "id",
        rows.map((row) => row.id),
      );

    await ProcessingJobService.update(supabase, data.jobId, {
      status: "PROCESSING",
      completed_at: null,
      error_message: null,
    });
    return { retried: rows.length };
  });
