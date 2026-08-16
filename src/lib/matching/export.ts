/**
 * Browser-safe exporters for matching candidate tables.
 * CSV and JSON are native; Excel uses SpreadsheetML 2003, which Excel, Numbers
 * and LibreOffice all open without any extra dependency.
 */

export type ExportFormat = "csv" | "json" | "xls";

export type ExportRow = Record<string, string | number | null | undefined>;

function escapeCsv(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeXml(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toCsv(rows: ExportRow[], headers: string[]) {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) lines.push(headers.map((header) => escapeCsv(row[header])).join(","));
  return lines.join("\n");
}

export function toSpreadsheetXml(rows: ExportRow[], headers: string[], sheetName = "Candidates") {
  const cell = (value: string | number | null | undefined) => {
    const isNumber = typeof value === "number" && Number.isFinite(value);
    return `<Cell><Data ss:Type="${isNumber ? "Number" : "String"}">${escapeXml(value)}</Data></Cell>`;
  };
  const body = rows
    .map((row) => `<Row>${headers.map((header) => cell(row[header])).join("")}</Row>`)
    .join("");
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${escapeXml(sheetName)}"><Table>
<Row>${headers.map(cell).join("")}</Row>
${body}
</Table></Worksheet></Workbook>`;
}

export function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportRows(
  rows: ExportRow[],
  headers: string[],
  baseName: string,
  format: ExportFormat,
) {
  if (format === "json") {
    downloadFile(JSON.stringify(rows, null, 2), `${baseName}.json`, "application/json");
    return;
  }
  if (format === "xls") {
    downloadFile(
      toSpreadsheetXml(rows, headers),
      `${baseName}.xls`,
      "application/vnd.ms-excel",
    );
    return;
  }
  downloadFile(toCsv(rows, headers), `${baseName}.csv`, "text/csv");
}
