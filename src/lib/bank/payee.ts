// Bank descriptions carry a lot of noise: "TRSF E-BANKING CR 0920/FTSCY/WS93436 PT MAJU JAYA".
// For "label this payee this way from now on" we need the part that repeats next month — the
// name — not the reference numbers that change every time.

// Transfer/channel words that appear on every line and identify nobody.
const NOISE = new Set([
  "trsf",
  "trf",
  "transfer",
  "e-banking",
  "ebanking",
  "mobile",
  "ib",
  "kr",
  "db",
  "cr",
  "dr",
  "to",
  "ke",
  "dari",
  "from",
  "pmt",
  "payment",
  "pembayaran",
  "via",
  "qris",
  "sw",
  "switching",
  "int",
  "bi-fast",
  "bifast",
  "rtgs",
  "skn",
  "setor",
  "tarik",
]);

const hasDigit = /\d/;

/**
 * The most likely payee/counterparty name in a bank description, or "" when nothing looks
 * like a name. Used as a "contains" rule pattern, so it must be stable month to month.
 */
export function payeeFromDescription(description: string): string {
  const words = description.replace(/\s+/g, " ").trim().split(" ");
  let best: string[] = [];
  let run: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[^\p{L}\p{N}.&'-]/gu, "");
    const isName = clean.length > 1 && !hasDigit.test(clean) && !NOISE.has(clean.toLowerCase());
    if (isName) {
      run.push(clean);
      // A company prefix alone ("PT", "CV") is not a name; keep collecting.
      if (run.length > best.length) best = [...run];
    } else {
      run = [];
    }
  }
  const name = best.join(" ");
  return name.length > 2 ? name : "";
}
