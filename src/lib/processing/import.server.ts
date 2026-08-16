import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { asExtractedFields, MEASUREMENT_FIELDS, MEASUREMENT_FIELD_META } from "@/lib/processing/types";

type Client = SupabaseClient<Database>;
type Metric = Database["public"]["Enums"]["measurement_metric"];

const FIELD_TO_METRIC: Record<(typeof MEASUREMENT_FIELDS)[number], Metric> = {
  hba1c: "HBA1C",
  bmi: "BMI",
  fastingGlucose: "FASTING_GLUCOSE",
  systolic: "SYSTOLIC_BP",
  diastolic: "DIASTOLIC_BP",
  ldl: "LDL",
  egfr: "EGFR",
};

export type ImportResult = {
  jobId: string;
  imported: number;
  skipped: number;
  linkedExisting: number;
};

/**
 * Promote reviewed extraction records of a job into the patient registry so the
 * deterministic matching engine has structured data to evaluate.
 */
export async function importJobRecords(
  supabase: Client,
  jobId: string,
  userId: string,
  recordIds?: string[],
): Promise<ImportResult> {
  let query = supabase
    .from("processing_patient_records")
    .select("*")
    .eq("job_id", jobId)
    .in("status", ["EXTRACTED", "NEEDS_REVIEW", "VERIFIED", "CORRECTED"])
    .order("record_index", { ascending: true })
    .limit(5000);
  if (recordIds && recordIds.length > 0) query = query.in("id", recordIds);

  const { data: records, error } = await query;
  if (error) throw new Error(error.message);

  let imported = 0;
  let skipped = 0;
  let linkedExisting = 0;

  for (const record of records ?? []) {
    const code = (record.patient_identifier ?? "").trim() || `EXT-${record.record_index + 1}`;
    if (!record.full_name && !record.patient_identifier) {
      skipped += 1;
      continue;
    }

    const conditions = (record.conditions ?? []).filter(Boolean);
    const patientPayload = {
      patient_code: code,
      full_name: record.full_name,
      age: record.age,
      sex: record.sex,
      date_of_birth: record.date_of_birth,
      primary_condition: conditions[0] ?? null,
      status: "ACTIVE",
      created_by: userId,
    };

    const { data: existing } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_code", code)
      .maybeSingle();

    let patientId: string;
    if (existing) {
      patientId = existing.id;
      const { error: updateError } = await supabase
        .from("patients")
        .update(patientPayload)
        .eq("id", patientId);
      if (updateError) throw new Error(updateError.message);
      linkedExisting += 1;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("patients")
        .insert(patientPayload)
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      patientId = inserted.id;
      imported += 1;
    }

    // Replace derived clinical data so re-importing stays idempotent.
    await supabase.from("patient_conditions").delete().eq("patient_id", patientId);
    if (conditions.length > 0) {
      const { error: condError } = await supabase.from("patient_conditions").insert(
        conditions.map((name) => ({ patient_id: patientId, name, status: "ACTIVE" })),
      );
      if (condError) throw new Error(condError.message);
    }

    const medications = (record.medications ?? []).filter(Boolean);
    await supabase.from("patient_medications").delete().eq("patient_id", patientId);
    if (medications.length > 0) {
      const { error: medError } = await supabase.from("patient_medications").insert(
        medications.map((name) => ({ patient_id: patientId, name, status: "ACTIVE" })),
      );
      if (medError) throw new Error(medError.message);
    }

    const fields = asExtractedFields(record.fields);
    const measurements = MEASUREMENT_FIELDS.flatMap((key) => {
      const field = fields[key];
      const numeric = typeof field?.value === "number" ? field.value : Number(field?.value);
      if (field?.value === null || field?.value === undefined || !Number.isFinite(numeric)) return [];
      return [
        {
          patient_id: patientId,
          metric: FIELD_TO_METRIC[key],
          value: numeric,
          unit: field.unit ?? MEASUREMENT_FIELD_META[key].unit,
          source: "AI" as const,
          source_page: field.sourcePage,
          original_value: numeric,
          confidence: field.confidence,
          verification_status: field.verificationStatus ?? "UNVERIFIED",
          notes: field.sourceText ? field.sourceText.slice(0, 500) : null,
          created_by: userId,
        },
      ];
    });

    await supabase.from("patient_measurements").delete().eq("patient_id", patientId).eq("source", "AI");
    if (measurements.length > 0) {
      const { error: measError } = await supabase.from("patient_measurements").insert(measurements);
      if (measError) throw new Error(measError.message);
    }
  }

  return { jobId, imported, skipped, linkedExisting };
}
