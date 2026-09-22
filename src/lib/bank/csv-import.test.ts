import { describe, expect, it } from "vitest";
import { parseCsv, parseRupiah, parseTemplateCsv } from "./csv-import";
import { TEMPLATE_CSV } from "./template";

const ACC = "00000000-0000-4000-8000-0000000000b1";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines in fields, CRLF, BOM", () => {
    expect(parseCsv('\uFEFFa,"b,c","say ""hi"""\r\n1,"two\nlines",3\r\n')).toEqual([
      ["a", "b,c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });

  it("row numbers in errors stay right when the file has blank lines", () => {
    const { errors } = parseTemplateCsv(ACC, "date,description,amount\n\n2026-09-01,x,abc\n");
    expect(errors.map((e) => e.line)).toEqual([3]);
  });
});

describe("parseRupiah", () => {
  it.each([
    ["1500000", 1_500_000n],
    ["1.500.000", 1_500_000n],
    ["1,500,000", 1_500_000n],
    ["Rp 1.500.000,00", 1_500_000n],
    ["1,500,000.00", 1_500_000n],
    ["-25.000", -25_000n],
    ["1.500", 1_500n],
    ["9.007.199.254.740.993", 9_007_199_254_740_993n],
  ])("%s → %s", (input, expected) => {
    expect(parseRupiah(input)).toBe(expected);
  });

  it("rejects cents instead of rounding", () => {
    expect(() => parseRupiah("12,50")).toThrow(/cents/);
    expect(() => parseRupiah("1.500.000,01")).toThrow(/cents/);
  });

  it.each(["", "abc", "1.50.000", "1.500.00", "1,500.000", "12.5"])("rejects %j", (input) => {
    expect(() => parseRupiah(input)).toThrow();
  });
});

describe("parseTemplateCsv", () => {
  it("parses the published template", () => {
    const { transactions, errors } = parseTemplateCsv(ACC, TEMPLATE_CSV);
    expect(errors).toEqual([]);
    expect(transactions).toMatchObject([
      {
        occurredAt: "2026-09-01T00:00:00+07:00",
        amount: 12_000_284n,
        direction: "in",
        description: "TRSF E-BANKING CR PT MAJU JAYA",
        balanceAfter: 52_000_284n,
      },
      { occurredAt: "2026-09-02T00:00:00+07:00", amount: 15_000n, direction: "out" },
    ]);
  });

  it("gives the same external_id on re-import, even from an overlapping statement", () => {
    const week1 = "date,description,amount\n2026-09-01,A,100\n2026-09-02,B,-200\n";
    const week2 = "date,description,amount\n2026-09-02,B,-200\n2026-09-03,C,300\n";
    const ids = (text: string) => parseTemplateCsv(ACC, text).transactions.map((t) => t.externalId);
    expect(ids(week1)).toEqual(ids(week1));
    expect(ids(week2)[0]).toBe(ids(week1)[1]);
  });

  it("keeps two identical transfers on the same day as two transactions", () => {
    const text =
      "date,description,amount\n2026-09-01,BIAYA ADM,-5000\n2026-09-01,BIAYA ADM,-5000\n";
    const [a, b] = parseTemplateCsv(ACC, text).transactions;
    expect(a.externalId).not.toBe(b.externalId);
  });

  it("different accounts get different ids for the same row", () => {
    const text = "date,description,amount\n2026-09-01,A,100\n";
    const other = "00000000-0000-4000-8000-0000000000b2";
    expect(parseTemplateCsv(ACC, text).transactions[0].externalId).not.toBe(
      parseTemplateCsv(other, text).transactions[0].externalId,
    );
  });

  it("reports bad rows with line numbers and keeps the good ones", () => {
    const text =
      "date,description,amount\n2026-09-01,ok,100\n2026-02-30,bad date,100\n2026-09-01,cents,12.50\n2026-09-01,zero,0\n";
    const { transactions, errors } = parseTemplateCsv(ACC, text);
    expect(transactions).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });

  it("accepts DD/MM/YYYY and normalizes whitespace in descriptions", () => {
    const { transactions } = parseTemplateCsv(
      ACC,
      "date,description,amount\n05/09/2026,  A   B ,1\n",
    );
    expect(transactions[0]).toMatchObject({
      occurredAt: "2026-09-05T00:00:00+07:00",
      description: "A B",
    });
  });

  it("rejects a file without the required columns", () => {
    expect(parseTemplateCsv(ACC, "tanggal,keterangan\n").errors[0].message).toMatch(/Missing/);
  });
});
