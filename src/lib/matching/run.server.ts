import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  evaluateMatch,
  MEASUREMENT_METRIC_TO_FIELD,
  type CanonicalNumericField,
  type EngineCriterion,
  type MatchEvaluation,
  type PatientFacts,
} from "@/lib/matching/engine";

type Client = SupabaseClient<Database>;

/** Patients evaluated per request so large datasets stream through in batches. */
export const PATIENTS_PER_BATCH = 100;

export type MatchBatchResult = {
  trialId: string;
  processed: number;
  nextOffset: number | null;
  totalPatients: number;
  potential: number;
  needsReview: number;
  ineligible: number;
};

export async function loadTrialCriteria(supabase: Client, trialId: string) {
  const { data, error } = await supabase
    .from("trial_criteria")
    .select("id, criterion_type, field, operator, value, value_secondary, unit, description, required")
    .eq("trial_id", trialId)
    .order("criterion_type", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EngineCriterion[];
}

/** Load structured facts for a page of patients using set-based queries only. */
export async function loadPatientFacts(
  supabase: Client,
  offset: number,
  limit: number,
): Promise<{ facts: PatientFacts[]; total: number }> {
  const { data, error, count } = await supabase
    .from("patients")
    .select("id, patient_code, full_name, age, sex, primary_condition", { count: "exact" })
    .order("patient_code", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const patients = data ?? [];
  const ids = patients.map((p) => p.id);
  if (ids.length === 0) return { facts: [], total: count ?? 0 };

  const [conditions, medications, measurements] = await Promise.all([
    supabase.from("patient_conditions").select("patient_id, name, status").in("patient_id", ids),
    supabase.from("patient_medications").select("patient_id, name, status").in("patient_id", ids),
    supabase
      .from("patient_measurements")
      .select("patient_id, metric, value, measured_on, created_at")
      .in("patient_id", ids)
      .order("measured_on", { ascending: false, nullsFirst: false }),
  ]);
  if (conditions.error) throw new Error(conditions.error.message);
  if (medications.error) throw new Error(medications.error.message);
  if (measurements.error) throw new Error(measurements.error.message);

  const conditionMap = new Map<string, string[]>();
  for (const row of conditions.data ?? []) {
    if (row.status === "RESOLVED") continue;
    const list = conditionMap.get(row.patient_id) ?? [];
    list.push(row.name);
    conditionMap.set(row.patient_id, list);
  }

  const medicationMap = new Map<string, string[]>();
  for (const row of medications.data ?? []) {
    if (row.status === "DISCONTINUED") continue;
    const list = medicationMap.get(row.patient_id) ?? [];
    list.push(row.name);
    medicationMap.set(row.patient_id, list);
  }

  // Rows arrive newest-first, so the first value seen per metric wins.
  const measurementMap = new Map<string, Partial<Record<CanonicalNumericField, number>>>();
  for (const row of measurements.data ?? []) {
    const key = MEASUREMENT_METRIC_TO_FIELD[row.metric as string];
    if (!key) continue;
    const bucket = measurementMap.get(row.patient_id) ?? {};
    if (bucket[key] === undefined) {
      const numeric = typeof row.value === "string" ? Number(row.value) : row.value;
      if (numeric !== null && Number.isFinite(numeric)) bucket[key] = numeric as number;
    }
    measurementMap.set(row.patient_id, bucket);
  }

  const facts: PatientFacts[] = patients.map((patient) => {
    const conditionList = conditionMap.get(patient.id) ?? [];
    if (patient.primary_condition) conditionList.push(patient.primary_condition);
    return {
      id: patient.id,
      patient_code: patient.patient_code,
      full_name: patient.full_name,
      age: patient.age,
      sex: patient.sex,
      conditions: conditionList,
      medications: medicationMap.get(patient.id) ?? [],
      measurements: measurementMap.get(patient.id) ?? {},
    };
  });

  return { facts, total: count ?? facts.length };
}

/** Persist evaluations: upsert the match rows, then replace their criterion audit trail. */
export async function persistEvaluations(
  supabase: Client,
  evaluations: MatchEvaluation[],
): Promise<void> {
  if (evaluations.length === 0) return;

  const { data: matches, error } = await supabase
    .from("trial_matches")
    .upsert(
      evaluations.map((evaluation) => ({
        patient_id: evaluation.patientId,
        trial_id: evaluation.trialId,
        status: evaluation.status,
        score: evaluation.score,
        needs_review: evaluation.status === "NEEDS_REVIEW",
        matched_at: new Date().toISOString(),
        summary: evaluation.summary,
        criteria_total: evaluation.totals.total,
        criteria_passed: evaluation.totals.passed,
        criteria_failed: evaluation.totals.failed,
        criteria_unknown: evaluation.totals.unknown,
      })),
      { onConflict: "patient_id,trial_id" },
    )
    .select("id, patient_id");
  if (error) throw new Error(error.message);

  const matchIdByPatient = new Map((matches ?? []).map((row) => [row.patient_id, row.id]));
  const matchIds = (matches ?? []).map((row) => row.id);

  if (matchIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("criterion_results")
      .delete()
      .in("match_id", matchIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  const rows = evaluations.flatMap((evaluation) => {
    const matchId = matchIdByPatient.get(evaluation.patientId);
    if (!matchId) return [];
    return evaluation.results.map((result) => ({
      match_id: matchId,
      criterion_id: result.criterionId,
      criterion_type: result.criterionType,
      field: result.field,
      operator: result.operator,
      required: result.required,
      actual_value: result.actualValue,
      expected_value: result.expectedValue,
      unit: result.unit,
      result: result.result,
      reason: result.reason,
    }));
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase
      .from("criterion_results")
      .insert(rows.slice(i, i + 500));
    if (insertError) throw new Error(insertError.message);
  }
}

/** Run one deterministic matching batch for a trial. */
export async function runMatchBatch(
  supabase: Client,
  trialId: string,
  offset: number,
): Promise<MatchBatchResult> {
  const criteria = await loadTrialCriteria(supabase, trialId);
  const { facts, total } = await loadPatientFacts(supabase, offset, PATIENTS_PER_BATCH);

  const evaluations = facts.map((patient) => evaluateMatch(patient, trialId, criteria));
  await persistEvaluations(supabase, evaluations);

  const nextOffset = offset + facts.length;
  return {
    trialId,
    processed: facts.length,
    nextOffset: facts.length === PATIENTS_PER_BATCH && nextOffset < total ? nextOffset : null,
    totalPatients: total,
    potential: evaluations.filter((e) => e.status === "POTENTIAL_MATCH").length,
    needsReview: evaluations.filter((e) => e.status === "NEEDS_REVIEW").length,
    ineligible: evaluations.filter((e) => e.status === "INELIGIBLE").length,
  };
}
