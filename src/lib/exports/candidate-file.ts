/**
 * Shared (browser + server safe) definitions for trial-ready candidate files.
 * The generated dataset is a research candidate list for human review — it is
 * never a final medical eligibility decision.
 */
import { toCsv, toSpreadsheetXml, type ExportRow } from "@/lib/matching/export";

export const MATCHING_ENGINE_VERSION = "deterministic-1.0.0";

export type CandidateExportScope = "ALL" | "POTENTIAL_MATCH" | "NEEDS_REVIEW" | "INELIGIBLE";
export type CandidateExportFormat = "csv" | "json" | "xlsx";

export const SCOPE_LABELS: Record<CandidateExportScope, string> = {
  ALL: "All extracted patients",
  POTENTIAL_MATCH: "Potential match patients",
  NEEDS_REVIEW: "Needs review patients",
  INELIGIBLE: "Ineligible patients",
};

export const FORMAT_LABELS: Record<CandidateExportFormat, string> = {
  csv: "CSV",
  json: "JSON",
  xlsx: "Excel (XLSX-compatible)",
};

export const CANDIDATE_HEADERS = [
  "Patient ID",
  "Name",
  "Age",
  "Sex",
  "Conditions",
  "HbA1c",
  "BMI",
  "Fasting Glucose",
  "Systolic",
  "Diastolic",
  "LDL",
  "eGFR",
  "Trial Code",
  "Trial Name",
  "Match Status",
  "Criteria Match Score",
  "Passed Criteria",
  "Failed Criteria",
  "Unknown Criteria",
  "Missing Information",
  "Verification Status",
  "Source Document",
  "Source Pages",
];

export type CandidateExportMetadata = {
  generatedAt: string;
  trialId: string | null;
  trialCode: string | null;
  trialName: string | null;
  sourceProcessingJobId: string | null;
  sourceProcessingJobName: string | null;
  scope: CandidateExportScope;
  patientCount: number;
  potentialMatches: number;
  needsReview: number;
  ineligible: number;
  matchingEngineVersion: string;
  disclaimer: string;
};

export const CANDIDATE_DISCLAIMER =
  "Research candidate dataset for human review. Not a final medical eligibility decision.";

export function fileExtension(format: CandidateExportFormat) {
  return format === "xlsx" ? "xls" : format;
}

export function mimeFor(format: CandidateExportFormat) {
  if (format === "json") return "application/json";
  if (format === "xlsx") return "application/vnd.ms-excel";
  return "text/csv";
}

/** Serialize rows + metadata into the requested file format. */
export function serializeCandidateFile(
  rows: ExportRow[],
  metadata: CandidateExportMetadata,
  format: CandidateExportFormat,
): string {
  if (format === "json") {
    return JSON.stringify({ metadata, patients: rows }, null, 2);
  }

  const metaPairs: [string, string | number][] = [
    ["Generated timestamp", metadata.generatedAt],
    ["Trial ID", metadata.trialId ?? ""],
    ["Trial code", metadata.trialCode ?? ""],
    ["Trial name", metadata.trialName ?? ""],
    ["Source processing job", metadata.sourceProcessingJobName ?? "Entire patient registry"],
    ["Export type", SCOPE_LABELS[metadata.scope]],
    ["Number of patients", metadata.patientCount],
    ["Potential matches", metadata.potentialMatches],
    ["Needs review", metadata.needsReview],
    ["Ineligible", metadata.ineligible],
    ["Matching engine version", metadata.matchingEngineVersion],
    ["Notice", metadata.disclaimer],
  ];

  if (format === "xlsx") {
    const metaRows: ExportRow[] = metaPairs.map(([key, value]) => ({ Field: key, Value: value }));
    const metaSheet = toSpreadsheetXml(metaRows, ["Field", "Value"], "Metadata");
    const dataSheet = toSpreadsheetXml(rows, CANDIDATE_HEADERS, "Candidates");
    // Merge both worksheets into a single workbook document.
    const worksheets = [metaSheet, dataSheet]
      .map((doc) => doc.slice(doc.indexOf("<Worksheet"), doc.lastIndexOf("</Workbook>")))
      .join("\n");
    return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets}
</Workbook>`;
  }

  const header = metaPairs.map(([key, value]) => `# ${key}: ${String(value).replace(/\n/g, " ")}`);
  return `${header.join("\n")}\n\n${toCsv(rows, CANDIDATE_HEADERS)}`;
}
