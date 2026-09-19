// CSV statement import: parse → normalize → stable external_id.
// Pure (no DB), so it is fully unit-tested. Money stays bigint end to end.
import { createHash } from "node:crypto";

export { TEMPLATE_CSV } from "./template";

export type ParsedTx = {
  externalId: string;
  occurredAt: string; // ISO timestamp, Asia/Jakarta midnight of the statement date
  amount: bigint; // > 0
  direction: "in" | "out";
  description: string;
  balanceAfter: bigint | null;
};

export type RowError = { line: number; message: string };

/** RFC 4180 CSV: quoted fields, "" escapes, commas/newlines inside quotes. Keeps blank rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

const isBlank = (row: string[]) => row.every((f) => f.trim() === "");

/**
 * Whole rupiah from bank text. Accepts "1.500.000", "1,500,000", "1500000", "Rp 1.500.000,00",
 * "-25.000". Groups must be 3 digits; decimals must be exactly 2 and zero — rupiah has no cents,
 * so "12,50" is an error, never rounded.
 */
export function parseRupiah(input: string): bigint {
  let s = input.replace(/\s|Rp\.?/gi, "");
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  // whole part: plain digits, or 3-digit groups split by "." or ","; then optional 2-digit decimals
  const m = /^(\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+)(?:([.,])(\d{2}))?$/.exec(s);
  if (!m) throw new Error(`"${input}" is not an amount`);
  const [, whole, decimalSep, cents] = m;
  if (decimalSep && whole.includes(decimalSep)) throw new Error(`"${input}" is not an amount`);
  if (cents && cents !== "00") {
    throw new Error(`"${input}" has cents; rupiah amounts must be whole`);
  }
  const value = BigInt(whole.replace(/[.,]/g, ""));
  return negative ? -value : value;
}

function parseDate(input: string): string {
  const s = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const idn = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); // DD/MM/YYYY (Indonesian order)
  if (!iso && !idn) throw new Error(`"${input}" is not a date (use YYYY-MM-DD or DD/MM/YYYY)`);
  const [y, mo, da] = iso ? [iso[1], iso[2], iso[3]] : [idn![3], idn![2], idn![1]];
  const check = new Date(Date.UTC(+y, +mo - 1, +da));
  if (check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +da) {
    throw new Error(`"${input}" is not a real date`);
  }
  return `${y}-${mo}-${da}T00:00:00+07:00`;
}

const REQUIRED_COLUMNS = ["date", "description", "amount"];

/**
 * Template format: header `date,description,amount[,balance]`.
 * amount is signed: positive = came in, negative = went out.
 *
 * external_id = sha256(account, date, amount, direction, description, n) where n counts
 * identical rows earlier in the same file. Two genuinely identical transfers on one day stay
 * distinct, while re-importing the same or an overlapping statement produces the same ids.
 */
export function parseTemplateCsv(accountId: string, text: string) {
  const [header, ...rows] = parseCsv(text);
  const cols = header?.map((h) => h.trim().toLowerCase()) ?? [];
  const missing = REQUIRED_COLUMNS.filter((h) => !cols.includes(h));
  if (missing.length) {
    return {
      transactions: [] as ParsedTx[],
      errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}` }],
    };
  }
  const at = (row: string[], name: string) => row[cols.indexOf(name)]?.trim() ?? "";

  const transactions: ParsedTx[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const line = i + 2;
    if (isBlank(row)) return;
    try {
      const occurredAt = parseDate(at(row, "date"));
      const signed = parseRupiah(at(row, "amount"));
      if (signed === 0n) throw new Error("amount is zero");
      const balanceText = at(row, "balance");
      const description = at(row, "description").replace(/\s+/g, " ");
      const direction = signed > 0n ? "in" : "out";
      const amount = signed > 0n ? signed : -signed;

      const key = [accountId, occurredAt.slice(0, 10), amount, direction, description].join("|");
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);

      transactions.push({
        externalId: createHash("sha256").update(`${key}|${n}`).digest("hex"),
        occurredAt,
        amount,
        direction,
        description,
        balanceAfter: balanceText ? parseRupiah(balanceText) : null,
      });
    } catch (e) {
      errors.push({ line, message: (e as Error).message });
    }
  });

  return { transactions, errors };
}
