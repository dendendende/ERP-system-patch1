import { describe, expect, it } from "vitest";
import { REPORTS, findReport } from "./report-library";
import {
  type ReportDef,
  describeParams,
  mayRun,
  readParams,
  reportCsv,
  reportPdf,
  reportQuery,
} from "./reports";

const C = "aa61445e-beab-4d86-8002-b7f92afc8dd2";
const report: ReportDef = {
  id: "test",
  title: "Test",
  description: "",
  params: [
    { key: "from", label: "From", kind: "day", default: (t) => `${t.slice(0, 8)}01` },
    { key: "month", label: "Month", kind: "month", default: (t) => t.slice(0, 7) },
    { key: "customer", label: "Customer", kind: "customer", default: () => "" },
  ],
  roles: ["owner"],
  run: async () => ({ columns: [], rows: [] }),
};

describe("report parameters", () => {
  it("keeps what is valid; anything else becomes its default", () => {
    expect(
      readParams(report, { from: "2026-09-15", month: "2026-08", customer: C }, "2026-10-09"),
    ).toEqual({ from: "2026-09-15", month: "2026-08", customer: C });
    expect(
      readParams(report, { from: "15/09/2026", month: "2026-13", customer: "x" }, "2026-10-09"),
    ).toEqual({ from: "2026-10-01", month: "2026-10", customer: "" });
    // only the report's own parameters are read
    expect(readParams(report, { evil: "1" }, "2026-10-09")).not.toHaveProperty("evil");
  });

  it("a run is an address: the report, then its parameters (empty ones left out)", () => {
    expect(reportQuery(report, { from: "2026-09-01", month: "2026-09", customer: "" })).toBe(
      "report=test&from=2026-09-01&month=2026-09",
    );
  });

  it("who may run it", () => {
    expect(mayRun(report, "owner")).toBe(true);
    expect(mayRun(report, "viewer")).toBe(false);
    expect(mayRun(REPORTS[0], "viewer")).toBe(true); // no roles: everyone signed in
    expect(mayRun(REPORTS[0], null)).toBe(false);
  });

  it("every report in the library has a unique id and only valid defaults", () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REPORTS) {
      expect(findReport(r.id)).toBe(r);
      const defaults = readParams(r, {}, "2026-10-09");
      expect(readParams(r, defaults, "2026-10-09"), r.id).toEqual(defaults);
    }
  });
});

describe("exporting a result", () => {
  const result = {
    columns: [
      { key: "name", label: "Plan", kind: "text" as const },
      { key: "total", label: "Came in", kind: "rupiah" as const },
      { key: "share", label: "Share", kind: "percent" as const },
    ],
    rows: [
      { cells: { name: "Business", total: 4_900_000n, share: 72.1 } },
      { cells: { name: "A".repeat(120), total: 1_900_000n, share: 27.9 } },
    ],
    totals: { name: "Total", total: 6_800_000n, share: null },
    notes: ["Payments by the day the money reached the bank."],
  };

  it("the spreadsheet keeps whole rupiah as numbers, so a column adds up; totals last", () => {
    const lines = reportCsv(result).replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Plan,Came in (Rp),Share");
    expect(lines[1]).toBe("Business,4900000,72.1");
    expect(lines[3]).toBe("Total,6800000,");
  });

  it("the PDF lines columns up, numbers on the right; a too-long first column gives way", () => {
    const pdf = Buffer.from(
      reportPdf(report, result, { params: "Up to: 30 Sep 2026", on: "2026-10-09" }),
    ).toString("latin1");
    const rows = [...pdf.matchAll(/\/F3 8 Tf [\d.]+ [\d.]+ Td \((.*)\) Tj/g)].map((m) => m[1]);
    // header, rule, 2 rows, rule, totals — every row the same width (100 characters fit at 8pt)
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatch(/^Plan +Came in +Share$/);
    expect(rows[2]).toMatch(/^Business +Rp 4\.900\.000 +72,1%$/);
    expect(rows[3]).toMatch(/^A+\.\.\. +Rp 1\.900\.000 +27,9%$/);
    expect(rows[3].length).toBeLessThanOrEqual(100);
    expect(rows[2].length).toBe(rows[3].length);
    expect(pdf).toContain("(Up to: 30 Sep 2026) Tj");
    expect(pdf).toContain("Payments by the day the money reached the bank.");
  });

  it("parameters in words", () => {
    expect(
      describeParams(
        report,
        { from: "2026-09-01", month: "2026-08", customer: C },
        new Map([[C, "PT Maju"]]),
      ),
    ).toBe("From: 1 Sept 2026 · Month: August 2026 · Customer: PT Maju");
  });
});
