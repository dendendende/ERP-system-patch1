// A cue's trend vs the previous period (P7-T5). Rupiah stays bigint all the way: the percentage
// is worked out in whole tenths, never by turning money into a float first.

export type Trend = {
  direction: "up" | "down" | "flat";
  /** Change in %, one decimal; null when there was nothing before to compare with. */
  percent: number | null;
  /** Whether this change is good news (green) or bad (rust); null when flat. */
  good: boolean | null;
};

/** Counts and ratios (4.5 months) become thousandths, so they compare like rupiah do. */
const exact = (x: bigint | number) => (typeof x === "bigint" ? x : BigInt(Math.round(x * 1000)));

export function trend(
  value: bigint | number,
  previous: bigint | number,
  /** "up": more is better (money in); "down": less is better (money out, late bills). */
  better: "up" | "down",
): Trend {
  const [now, before] =
    typeof value === typeof previous
      ? [exact(value), exact(previous)]
      : [exact(Number(value)), exact(Number(previous))];
  if (now === before) return { direction: "flat", percent: 0, good: null };
  const direction = now > before ? "up" : "down";
  const size = before < 0n ? -before : before;
  const percent = size === 0n ? null : Number(((now - before) * 1000n) / size) / 10;
  return { direction, percent, good: (direction === "up") === (better === "up") };
}
