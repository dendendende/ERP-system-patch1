// A text-only PDF (A4, Helvetica; Courier for lines that must line up, like a report's table).
// Lines flow onto as many pages as they need. Enough for an invoice and a report; no dependency.
// ponytail: Latin-1 text only (other characters become "?"), no images. Use a PDF library if
// documents ever need images, charts or non-Latin names.

export type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapBefore?: number;
  /** Courier, never wrapped: columns line up (the caller keeps the line short enough). */
  mono?: boolean;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;

/** How many Courier characters fit across the page at this size (each is 0.6 of the size wide). */
export const monoWidth = (size: number) => Math.floor((PAGE_WIDTH - 2 * MARGIN) / (size * 0.6));

/** Latin-1 only, with the few typographic characters we use mapped to plain ones. */
function latin1(text: string) {
  return text
    .replace(/[‒-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
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
  const pages: string[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;
  for (const { text, size = 11, bold = false, gapBefore = 0, mono = false } of lines) {
    y -= gapBefore;
    for (const part of mono ? [latin1(text)] : wrap(latin1(text), size)) {
      // no room left for this line: a new page
      if (y - size * 1.45 < MARGIN) {
        pages.push([]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= size * 1.45;
      const font = mono ? "F3" : bold ? "F2" : "F1";
      pages[pages.length - 1].push(
        `BT /${font} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${escape(part)}) Tj ET`,
      );
    }
  }

  // 1 catalog, 2 page list, 3–5 fonts, then each page and its content: 6 + 2i and 7 + 2i
  const pageId = (i: number) => 6 + 2 * i;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    ...pages.flatMap((ops, i) => {
      const content = ops.join("\n");
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      ];
    }),
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
