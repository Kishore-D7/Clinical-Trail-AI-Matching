import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  evaluateMatch,
  MEASUREMENT_METRIC_TO_FIELD,
  type CanonicalNumericField,
  type MatchEvaluation,
  type PatientFacts,
} from "@/lib/matching/engine";
import { loadTrialCriteria, persistEvaluations } from "@/lib/matching/run.server";

type Client = SupabaseClient<Database>;

export async function matchSinglePatient(
  supabase: Client,
  trialId: string,
  patientId: string,
): Promise<MatchEvaluation> {
  const criteria = await loadTrialCriteria(supabase, trialId);

  const [patient, conditions, medications, measurements] = await Promise.all([
    supabase
      .from("patients")
      .select("id, patient_code, full_name, age, sex, primary_condition")
      .eq("id", patientId)
      .maybeSingle(),
    supabase.from("patient_conditions").select("name, status").eq("patient_id", patientId),
    supabase.from("patient_medications").select("name, status").eq("patient_id", patientId),
    supabase
      .from("patient_measurements")
      .select("metric, value, measured_on")
      .eq("patient_id", patientId)
      .order("measured_on", { ascending: false, nullsFirst: false }),
  ]);

  if (patient.error) throw new Error(patient.error.message);
  if (!patient.data) throw new Error("Patient not found");
  if (conditions.error) throw new Error(conditions.error.message);
  if (medications.error) throw new Error(medications.error.message);
  if (measurements.error) throw new Error(measurements.error.message);

  const values: Partial<Record<CanonicalNumericField, number>> = {};
  for (const row of measurements.data ?? []) {
    const key = MEASUREMENT_METRIC_TO_FIELD[row.metric as string];
    if (!key || values[key] !== undefined) continue;
    const numeric = typeof row.value === "string" ? Number(row.value) : row.value;
    if (numeric !== null && Number.isFinite(numeric)) values[key] = numeric as number;
  }

  const conditionList = (conditions.data ?? [])
    .filter((row) => row.status !== "RESOLVED")
    .map((row) => row.name);
  if (patient.data.primary_condition) conditionList.push(patient.data.primary_condition);

  const facts: PatientFacts = {
    id: patient.data.id,
    patient_code: patient.data.patient_code,
    full_name: patient.data.full_name,
    age: patient.data.age,
    sex: patient.data.sex,
    conditions: conditionList,
    medications: (medications.data ?? [])
      .filter((row) => row.status !== "DISCONTINUED")
      .map((row) => row.name),
    measurements: values,
  };

  const evaluation = evaluateMatch(facts, trialId, criteria);
  await persistEvaluations(supabase, [evaluation]);
  return evaluation;
}
