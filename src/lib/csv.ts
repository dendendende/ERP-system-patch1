// CSV for Excel / Google Sheets. Text cells that start like a formula (= + - @) get a leading
// apostrophe, so a bank description such as "=HYPERLINK(...)" can't run when the file is opened.
// Numbers are written as numbers (whole rupiah), so the spreadsheet can add them up.

export type CsvCell = string | number | bigint | null | undefined;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint" || typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows → CSV text, with a byte-order mark so Excel reads it as UTF-8 (Rp, ••, accents). */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
