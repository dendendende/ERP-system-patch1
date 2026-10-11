// Period comparison on charts (P9-T6): "vs a month before" / "vs a year before". The page keeps
// the choice in its address (?vs=month|year) and runs each chart's own query again for the day or
// dates shifted back, so a comparison always counts the same way as the chart itself.
import { shiftMonth } from "./metrics";

export type Vs = "month" | "year";

export const readVs = (v: string | string[] | undefined): Vs | null => {
  const one = Array.isArray(v) ? v[0] : v;
  return one === "month" || one === "year" ? one : null;
};

/** How the toggle and the marks say it. */
export const VS_WORDS: Record<Vs, string> = { month: "a month before", year: "a year before" };

const MONTHS: Record<Vs, number> = { month: 1, year: 12 };

/** The same day a month or a year earlier (31 Mar → 28 or 29 Feb). */
export const shiftBack = (day: string, vs: Vs) => shiftMonth(day, -MONTHS[vs]);
/** A month's first day (YYYY-MM-01) moved forward again: which shown month a compared one is. */
export const shiftForward = (day: string, vs: Vs) => shiftMonth(day, MONTHS[vs]);

/** "↑ 12%", "↓ 5%", "same", "new" (nothing before). Not good or bad: just which way. */
export function changeWords(now: bigint, before: bigint): string {
  if (before === 0n) return now === 0n ? "same" : "new";
  const r = Math.round(Number(((now - before) * 1000n) / before) / 10);
  if (r === 0) return "same";
  return `${r > 0 ? "↑" : "↓"} ${Math.abs(r)}%`;
}

/**
 * An earlier value from a "top N" list (the biggest six, say). Missing from a full list: it was
 * smaller than the last one shown, so not known (null, no mark). Missing from a shorter list:
 * there was nothing (0).
 */
export function fromTop<K>(earlier: Map<K, bigint>, key: K, top: number): bigint | null {
  return earlier.get(key) ?? (earlier.size < top ? 0n : null);
}
