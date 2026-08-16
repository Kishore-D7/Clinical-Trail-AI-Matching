import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  CANDIDATE_DISCLAIMER,
  MATCHING_ENGINE_VERSION,
  SCOPE_LABELS,
  fileExtension,
  mimeFor,
  serializeCandidateFile,
  type CandidateExportFormat,
  type CandidateExportMetadata,
  type CandidateExportScope,
} from "@/lib/exports/candidate-file";
import { MEASUREMENT_METRIC_TO_FIELD, type CanonicalNumericField } from "@/lib/matching/engine";
import type { ExportRow } from "@/lib/matching/export";

type Client = SupabaseClient<Database>;

export const CANDIDATE_EXPORT_BUCKET = "candidate-exports";

const METRIC_COLUMNS: { field: CanonicalNumericField; header: string; unit: string }[] = [
  { field: "hba1c", header: "HbA1c", unit: "%" },
  { field: "bmi", header: "BMI", unit: "" },
  { field: "fasting_glucose", header: "Fasting Glucose", unit: "mg/dL" },
  { field: "systolic", header: "Systolic", unit: "mmHg" },
  { field: "diastolic", header: "Diastolic", unit: "mmHg" },
  { field: "ldl", header: "LDL", unit: "mg/dL" },
  { field: "egfr", header: "eGFR", unit: "mL/min/1.73m²" },
];

function fmt(value: number | undefined, unit: string) {
  if (value === undefined) return "";
  return unit ? `${value} ${unit}` : String(value);
}

function criterionLabel(row: {
  field: string;
  expected_value: string | null;
  criterion_type: string;
}) {
  const prefix = row.criterion_type === "EXCLUSION" ? "[exclusion] " : "";
  return `${prefix}${row.field} ${row.expected_value ?? ""}`.trim();
}

export type BuildCandidateFileInput = {
  trialId: string;
  scope: CandidateExportScope;
  format: CandidateExportFormat;
  jobId?: string | null;
};

export type BuiltCandidateFile = {
  content: string;
  fileName: string;
  mimeType: string;
  metadata: CandidateExportMetadata;
  counts: { total: number; potential: number; needsReview: number; ineligible: number };
};

/** Assemble a trial-ready candidate dataset straight from the database. */
export async function buildCandidateFile(
  supabase: Client,
  input: BuildCandidateFileInput,
): Promise<BuiltCandidateFile> {
  const { data: trial, error: trialError } = await supabase
    .from("clinical_trials")
    .select("id, trial_code, title")
    .eq("id", input.trialId)
    .maybeSingle();
  if (trialError) throw new Error(trialError.message);
  if (!trial) throw new Error("Trial not found");

  let job: { id: string; file_name: string } | null = null;
  let jobCodes: Set<string> | null = null;
  const sourceByCode = new Map<string, { document: string; pages: string }>();

  if (input.jobId) {
    const { data: jobRow, error: jobError } = await supabase
      .from("processing_jobs")
      .select("id, file_name")
      .eq("id", input.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    job = jobRow ?? null;
  }

  // Source evidence (document + pages) comes from the bulk processing records.
  const recordQuery = supabase
    .from("processing_patient_records")
    .select("job_id, record_index, patient_identifier, page_start, page_end")
    .limit(10000);
  const { data: records, error: recordError } = input.jobId
    ? await recordQuery.eq("job_id", input.jobId)
    : await recordQuery;
  if (recordError) throw new Error(recordError.message);

  const jobNames = new Map<string, string>();
  if ((records ?? []).length > 0) {
    const jobIds = [...new Set((records ?? []).map((r) => r.job_id))];
    const { data: jobs } = await supabase
      .from("processing_jobs")
      .select("id, file_name")
      .in("id", jobIds);
    for (const row of jobs ?? []) jobNames.set(row.id, row.file_name);
  }

  if (input.jobId) jobCodes = new Set<string>();
  for (const row of records ?? []) {
    const code = (row.patient_identifier ?? "").trim() || `EXT-${row.record_index + 1}`;
    jobCodes?.add(code);
    const pages =
      row.page_start && row.page_end && row.page_end !== row.page_start
        ? `pages ${row.page_start}–${row.page_end}`
        : row.page_start
          ? `page ${row.page_start}`
          : "";
    if (!sourceByCode.has(code)) {
      sourceByCode.set(code, { document: jobNames.get(row.job_id) ?? "", pages });
    }
  }

  // Patients in scope.
  let patientQuery = supabase
    .from("patients")
    .select("id, patient_code, full_name, age, sex, primary_condition")
    .order("patient_code", { ascending: true })
    .limit(10000);
  if (jobCodes) {
    const codes = [...jobCodes];
    if (codes.length === 0) throw new Error("That processing job has no imported patients");
    patientQuery = patientQuery.in("patient_code", codes);
  }
  const { data: patients, error: patientError } = await patientQuery;
  if (patientError) throw new Error(patientError.message);
  const patientIds = (patients ?? []).map((p) => p.id);
  if (patientIds.length === 0) throw new Error("No patients found for that population");

  const [matchesRes, conditionsRes, measurementsRes] = await Promise.all([
    supabase
      .from("trial_matches")
      .select(
        "id, patient_id, status, score, criteria_passed, criteria_failed, criteria_unknown, summary",
      )
      .eq("trial_id", input.trialId)
      .limit(10000),
    supabase.from("patient_conditions").select("patient_id, name, status").in("patient_id", patientIds),
    supabase
      .from("patient_measurements")
      .select("patient_id, metric, value, verification_status, measured_on")
      .in("patient_id", patientIds)
      .order("measured_on", { ascending: false, nullsFirst: false }),
  ]);
  if (matchesRes.error) throw new Error(matchesRes.error.message);
  if (conditionsRes.error) throw new Error(conditionsRes.error.message);
  if (measurementsRes.error) throw new Error(measurementsRes.error.message);

  const matchByPatient = new Map((matchesRes.data ?? []).map((row) => [row.patient_id, row]));

  // Criterion audit trail for failed / unknown labels.
  const matchIds = (matchesRes.data ?? []).map((row) => row.id);
  const criteriaByMatch = new Map<string, { failed: string[]; unknown: string[]; passed: number }>();
  for (let i = 0; i < matchIds.length; i += 200) {
    const { data, error } = await supabase
      .from("criterion_results")
      .select("match_id, field, expected_value, criterion_type, result")
      .in("match_id", matchIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const bucket = criteriaByMatch.get(row.match_id) ?? { failed: [], unknown: [], passed: 0 };
      if (row.result === "FAIL") bucket.failed.push(criterionLabel(row));
      else if (row.result === "UNKNOWN") bucket.unknown.push(criterionLabel(row));
      else bucket.passed += 1;
      criteriaByMatch.set(row.match_id, bucket);
    }
  }

  const conditionsByPatient = new Map<string, string[]>();
  for (const row of conditionsRes.data ?? []) {
    if (row.status === "RESOLVED") continue;
    const list = conditionsByPatient.get(row.patient_id) ?? [];
    list.push(row.name);
    conditionsByPatient.set(row.patient_id, list);
  }

  const measurementsByPatient = new Map<
    string,
    { values: Partial<Record<CanonicalNumericField, number>>; total: number; verified: number }
  >();
  for (const row of measurementsRes.data ?? []) {
    const bucket = measurementsByPatient.get(row.patient_id) ?? { values: {}, total: 0, verified: 0 };
    bucket.total += 1;
    if (row.verification_status !== "UNVERIFIED") bucket.verified += 1;
    const key = MEASUREMENT_METRIC_TO_FIELD[row.metric as string];
    if (key && bucket.values[key] === undefined) {
      const numeric = typeof row.value === "string" ? Number(row.value) : row.value;
      if (numeric !== null && Number.isFinite(numeric)) bucket.values[key] = numeric as number;
    }
    measurementsByPatient.set(row.patient_id, bucket);
  }

  const rows: ExportRow[] = [];
  const counts = { total: 0, potential: 0, needsReview: 0, ineligible: 0 };

  for (const patient of patients ?? []) {
    const match = matchByPatient.get(patient.id);
    const status = match?.status ?? "NOT_EVALUATED";
    if (input.scope !== "ALL" && status !== input.scope) continue;

    const audit = match ? criteriaByMatch.get(match.id) : undefined;
    const measurement = measurementsByPatient.get(patient.id);
    const values = measurement?.values ?? {};

    const conditions = [
      ...new Set([...(conditionsByPatient.get(patient.id) ?? []), patient.primary_condition ?? ""]),
    ].filter(Boolean);

    const missing = METRIC_COLUMNS.filter((m) => values[m.field] === undefined).map((m) => m.header);
    if (patient.age === null) missing.push("Age");
    if (!patient.sex) missing.push("Sex");

    const verification =
      !measurement || measurement.total === 0 || measurement.verified === 0
        ? "UNVERIFIED"
        : measurement.verified < measurement.total
          ? "PARTIALLY_VERIFIED"
          : "VERIFIED";

    const source = sourceByCode.get(patient.patient_code);

    const row: ExportRow = {
      "Patient ID": patient.patient_code,
      Name: patient.full_name ?? "",
      Age: patient.age ?? "",
      Sex: patient.sex ?? "",
      Conditions: conditions.join("; ") || "None recorded",
      "Trial Code": trial.trial_code,
      "Trial Name": trial.title,
      "Match Status": status,
      "Criteria Match Score": match?.score !== null && match?.score !== undefined ? Number(match.score) : "",
      "Passed Criteria": audit ? audit.passed : (match?.criteria_passed ?? ""),
      "Failed Criteria": audit && audit.failed.length > 0 ? audit.failed.join("; ") : "None",
      "Unknown Criteria": audit && audit.unknown.length > 0 ? audit.unknown.join("; ") : "None",
      "Missing Information": missing.length > 0 ? missing.join("; ") : "None",
      "Verification Status": verification,
      "Source Document": source?.document ?? "",
      "Source Pages": source?.pages ?? "",
    };
    for (const metric of METRIC_COLUMNS) row[metric.header] = fmt(values[metric.field], metric.unit);
    rows.push(row);

    counts.total += 1;
    if (status === "POTENTIAL_MATCH") counts.potential += 1;
    else if (status === "NEEDS_REVIEW") counts.needsReview += 1;
    else if (status === "INELIGIBLE") counts.ineligible += 1;
  }

  if (rows.length === 0) throw new Error(`No patients matched "${SCOPE_LABELS[input.scope]}"`);

  const generatedAt = new Date().toISOString();
  const metadata: CandidateExportMetadata = {
    generatedAt,
    trialId: trial.id,
    trialCode: trial.trial_code,
    trialName: trial.title,
    sourceProcessingJobId: job?.id ?? null,
    sourceProcessingJobName: job?.file_name ?? null,
    scope: input.scope,
    patientCount: counts.total,
    potentialMatches: counts.potential,
    needsReview: counts.needsReview,
    ineligible: counts.ineligible,
    matchingEngineVersion: MATCHING_ENGINE_VERSION,
    disclaimer: CANDIDATE_DISCLAIMER,
  };

  const stamp = generatedAt.replace(/[:.]/g, "-");
  const fileName = `${trial.trial_code}-${input.scope.toLowerCase()}-${stamp}.${fileExtension(input.format)}`;

  return {
    content: serializeCandidateFile(rows, metadata, input.format),
    fileName,
    mimeType: mimeFor(input.format),
    metadata,
    counts,
  };
}
