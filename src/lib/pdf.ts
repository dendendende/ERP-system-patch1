// A one-page, text-only PDF (A4, Helvetica). Enough for an invoice; no dependency needed.
// ponytail: single page, Latin-1 text only (other characters become "?"). Use a PDF library if
// invoices ever need images, tables or non-Latin names.

export type PdfLine = { text: string; size?: number; bold?: boolean; gapBefore?: number };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;

/** Latin-1 only, with the few typographic characters we use mapped to plain ones. */
function latin1(text: string) {
  return text
    .replace(/[‒-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\u0000-ÿ]/g, "?");
}

const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);

/** Break a line so it fits the page (Helvetica averages about half its size per character). */
function wrap(text: string, size: number) {
  const max = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (size * 0.5));
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > max) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  out.push(line);
  return out;
}

export function textPdf(lines: PdfLine[]): Uint8Array {
  let y = PAGE_HEIGHT - MARGIN;
  const ops: string[] = [];
  for (const { text, size = 11, bold = false, gapBefore = 0 } of lines) {
    y -= gapBefore;
    for (const part of wrap(latin1(text), size)) {
      y -= size * 1.45;
      ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${escape(part)}) Tj ET`);
    }
  }
  const content = ops.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  // Every character is one byte (Latin-1), so string lengths are byte offsets.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(pdf, "latin1"));
}
