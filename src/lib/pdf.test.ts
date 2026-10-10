import { describe, expect, it } from "vitest";
import { monoWidth, textPdf } from "./pdf";

const asText = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("textPdf", () => {
  const pdf = asText(
    textPdf([
      { text: "TAGIHAN INV-0237", size: 18, bold: true },
      { text: "Mohon transfer tepat Rp 4.900.001 — (tiga angka terakhir)", gapBefore: 8 },
      { text: "Pay to BCA 1234567890 \\ back\\slash, and a long line ".repeat(6) },
    ]),
  );

  it("is a well-formed PDF whose cross-reference table points at every object", () => {
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    const offsets = [...pdf.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(7); // catalog, page list, 3 fonts, one page and its content
    offsets.forEach((offset, i) => expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it("the content stream length is exact", () => {
    const length = Number(/\/Length (\d+)/.exec(pdf)![1]);
    const body = pdf.slice(pdf.indexOf("stream\n") + 7, pdf.indexOf("\nendstream"));
    expect(body.length).toBe(length);
  });

  it("escapes brackets and backslashes, maps dashes, and wraps long lines", () => {
    expect(pdf).toContain("(Mohon transfer tepat Rp 4.900.001 - \\(tiga angka terakhir\\)) Tj");
    expect(pdf).toContain("\\\\ back\\\\slash");
    expect(pdf.match(/Pay to BCA/g)!.length).toBe(6);
    expect(pdf.match(/ Tj ET/g)!.length).toBeGreaterThan(3); // the long line took several lines
  });

  it("flows onto more pages, and Courier lines are never wrapped", () => {
    const long = asText(
      textPdf([
        { text: "Report", size: 16, bold: true },
        ...Array.from({ length: 120 }, (_, i) => ({
          text: `row ${i} `.padEnd(90, "."),
          mono: true,
          size: 8,
        })),
      ]),
    );
    const count = Number(/\/Count (\d+)/.exec(long)![1]);
    expect(count).toBeGreaterThan(1);
    expect(long.match(/\/Type \/Page /g)).toHaveLength(count);
    expect(long.match(/\/F3 8 Tf/g)).toHaveLength(120); // one line each: none wrapped
    expect(long).toContain("/BaseFont /Courier");
    // every cross-reference entry still points at its object, across pages
    const start = Number(/startxref\n(\d+)/.exec(long)![1]);
    const offsets = [...long.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toHaveLength(5 + 2 * count);
    offsets.forEach((o, i) => expect(long.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(monoWidth(8)).toBe(100);
  });
});
