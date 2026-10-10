// Reports (P9-T1, UPGRADE-v2 §5.7): the framework. Each report (report-library.ts) has typed
// parameters and runs with the reader's own permissions (RLS); one result is shown, printed (PDF)
// or downloaded (CSV). A run is an address — /reports?report=<id>&<its parameters> — so a favourite is
// just that address, saved (saved_views, list "reports").
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./auth/routes";
import { toCsv } from "./csv";
import type { Database } from "./database.types";
import { formatRupiah } from "./money";
import { isUuid } from "./money-filters";
import { type PdfLine, monoWidth, textPdf } from "./pdf";

type Client = SupabaseClient<Database>;

export type Param = {
  key: string;
  label: string;
  /** day = YYYY-MM-DD, month = YYYY-MM, customer = a customer's id */
  kind: "day" | "month" | "customer";
  /** what it is when not given (or given wrong) */
  default: (today: string) => string;
};

export type ReportColumn = {
  key: string;
  label: string;
  kind: "text" | "rupiah" | "number" | "percent" | "day";
};

export type Cell = string | number | bigint | null;

export type ReportResult = {
  columns: ReportColumn[];
  rows: {
    cells: Record<string, Cell>;
    /** the list behind the row */
    href?: string;
    /** a subtotal or a key line: shown in bold */
    strong?: boolean;
  }[];
  totals?: Record<string, Cell>;
  /** plain sentences under the table: what is counted, what is left out */
  notes?: string[];
};

export type ReportDef = {
  id: string;
  title: string;
  description: string;
  params: Param[];
  /** who may run it (default: everyone signed in) */
  roles?: Role[];
  run: (db: Client, params: Record<string, string>) => Promise<ReportResult>;
};

export const mayRun = (report: ReportDef, role: Role | null | undefined) =>
  !!role && (!report.roles || report.roles.includes(role));

const VALID: Record<Param["kind"], (v: string) => boolean> = {
  day: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
  month: (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
  customer: isUuid,
};

/** The report's parameters from the address: each checked, anything wrong replaced by its default. */
export function readParams(
  report: ReportDef,
  query: Record<string, string | string[] | undefined>,
  today: string,
): Record<string, string> {
  return Object.fromEntries(
    report.params.map((p) => {
      const raw = query[p.key];
      const v = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
      return [p.key, VALID[p.kind](v) ? v : p.default(today)];
    }),
  );
}

/** The run as the part after "?": its link, and what a favourite stores. */
export function reportQuery(report: ReportDef, params: Record<string, string>) {
  const q = new URLSearchParams({ report: report.id });
  for (const p of report.params) if (params[p.key]) q.set(p.key, params[p.key]);
  return q.toString();
}

// ---- showing a result: on screen, in a PDF, in a spreadsheet ---------------------------------

const shortDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const monthName = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** One cell as it reads on screen and in the PDF (the spreadsheet keeps raw numbers). */
export function showCell(kind: ReportColumn["kind"], value: Cell): string {
  if (value === null || value === "") return "—";
  switch (kind) {
    case "rupiah":
      return formatRupiah(BigInt(value));
    case "percent":
      return `${Number(value).toLocaleString("id-ID")}%`;
    case "number":
      return Number(value).toLocaleString("id-ID");
    case "day":
      return shortDay.format(new Date(`${value}T00:00:00Z`));
    default:
      return String(value);
  }
}

/** Numbers line up on the right; words and dates on the left. */
export const alignRight = (kind: ReportColumn["kind"]) => kind !== "text" && kind !== "day";

/** "Up to: 30 Sep 2026" — the parameters a run was made with, in words (names for ids). */
export function describeParams(
  report: ReportDef,
  params: Record<string, string>,
  names: Map<string, string> = new Map(),
) {
  return report.params
    .map((p) => {
      const v = params[p.key];
      const shown =
        p.kind === "day"
          ? showCell("day", v)
          : p.kind === "month"
            ? monthName.format(new Date(`${v}-01T00:00:00Z`))
            : (names.get(v) ?? "—");
      return `${p.label}: ${shown}`;
    })
    .join(" · ");
}

/** The result as a spreadsheet: raw numbers (whole rupiah) so the columns add up; totals last. */
export function reportCsv(result: ReportResult) {
  const row = (cells: Record<string, Cell>) => result.columns.map((c) => cells[c.key] ?? null);
  return toCsv(
    result.columns.map((c) => (c.kind === "rupiah" ? `${c.label} (Rp)` : c.label)),
    [...result.rows.map((r) => row(r.cells)), ...(result.totals ? [row(result.totals)] : [])],
  );
}

const TABLE_SIZE = 8;

/**
 * The result as a printable PDF: title, what it was run for, the table in aligned columns (the
 * first column gives way when the page is too narrow), totals, and the notes.
 */
export function reportPdf(
  report: ReportDef,
  result: ReportResult,
  ran: { params: string; on: string },
): Uint8Array {
  const text = (cells: Record<string, Cell>) =>
    result.columns.map((c) =>
      cells[c.key] === undefined || cells[c.key] === null ? "" : showCell(c.kind, cells[c.key]),
    );
  const body = [
    ...result.rows.map((r) => text(r.cells)),
    ...(result.totals ? [text(result.totals)] : []),
  ];
  const widths = result.columns.map((c, i) =>
    Math.max(c.label.length, ...body.map((r) => r[i].length)),
  );
  // gaps of 2 between columns; the first column shrinks to fit the page (never below 8)
  const room = monoWidth(TABLE_SIZE) - 2 * (widths.length - 1);
  const over = widths.reduce((t, w) => t + w, 0) - room;
  if (over > 0) widths[0] = Math.max(8, widths[0] - over);
  const fit = (s: string, w: number) => (s.length > w ? `${s.slice(0, w - 3)}...` : s);
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => {
        const v = fit(cell, widths[i]);
        return alignRight(result.columns[i].kind) ? v.padStart(widths[i]) : v.padEnd(widths[i]);
      })
      .join("  ")
      .trimEnd();
  const rule = widths.map((w) => "-".repeat(w)).join("  ");

  const lines: PdfLine[] = [
    { text: report.title, size: 16, bold: true },
    { text: ran.params, size: 10, gapBefore: 2 },
    { text: `Made ${showCell("day", ran.on)} · Cashflow`, size: 9, gapBefore: 2 },
    {
      text: line(result.columns.map((c) => c.label)),
      mono: true,
      size: TABLE_SIZE,
      gapBefore: 12,
    },
    { text: rule, mono: true, size: TABLE_SIZE },
    ...body
      .slice(0, result.rows.length)
      .map((cells) => ({ text: line(cells), mono: true, size: TABLE_SIZE })),
    ...(result.totals
      ? [
          { text: rule, mono: true, size: TABLE_SIZE },
          { text: line(body[body.length - 1]), mono: true, size: TABLE_SIZE },
        ]
      : []),
    ...(result.rows.length ? [] : [{ text: "Nothing matches these choices.", gapBefore: 6 }]),
    ...(result.notes ?? []).map((n, i) => ({ text: n, size: 9, gapBefore: i ? 0 : 12 })),
  ];
  return textPdf(lines);
}
