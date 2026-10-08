// Money is always integer rupiah (bigint). Formatting happens only here, at display time.

const MINUS = "−";

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** `Rp 12.000.284`. Negative amounts get a real minus sign: `−Rp 5.000`. */
export function formatRupiah(amount: bigint): string {
  const sign = amount < 0n ? MINUS : "";
  const abs = amount < 0n ? -amount : amount;
  return `${sign}Rp ${groupThousands(abs.toString())}`;
}

const UNITS = [
  { size: 1_000n, label: "rb" },
  { size: 1_000_000n, label: "jt" },
  { size: 1_000_000_000n, label: "M" },
  { size: 1_000_000_000_000n, label: "T" },
] as const;

/** Short form for tight spaces: `Rp 12 jt`, `Rp 2,65 M`. Rounded half-up to 2 decimals. */
export function formatRupiahShort(amount: bigint): string {
  const sign = amount < 0n ? MINUS : "";
  const abs = amount < 0n ? -amount : amount;

  let i = UNITS.findLastIndex((u) => abs >= u.size);
  if (i === -1) return `${sign}Rp ${abs}`;

  const hundredths = (u: bigint) => (abs * 100n + u / 2n) / u;
  let h = hundredths(UNITS[i].size);
  // 999.999.999 rounds to "1000 jt" — show "1 M" instead.
  if (h >= 100_000n && i < UNITS.length - 1) h = hundredths(UNITS[++i].size);

  const whole = groupThousands((h / 100n).toString());
  const frac = (h % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${sign}Rp ${whole}${frac ? "," + frac : ""} ${UNITS[i].label}`;
}

/** What someone typed into an amount box: "1.500.000", "1 500 000" or "1500000". null if it
 * isn't a plain positive whole number of rupiah. */
export function parseRupiahInput(input: string): bigint | null {
  const digits = input.replace(/[.\s]/g, "");
  if (!/^\d{1,18}$/.test(digits)) return null;
  const amount = BigInt(digits);
  return amount > 0n ? amount : null;
}

/** The built-in category a mistaken hand entry is filed under; every total leaves it out. */
export const CANCELLED_CATEGORY = "Cancelled (entered by mistake)";
