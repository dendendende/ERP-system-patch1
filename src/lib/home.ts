// The sentences on Home, in words a non-finance owner reads in a glance.
import { formatRupiahShort } from "./money";

/** A piece of the headline: plain words, or a number that opens its list. */
export type HeadlinePart = string | { text: string; opens: "cash" | "runway" };

/** "You have Rp 250 jt in the bank — enough for about 14 months at your usual costs." */
export function homeHeadline(
  cash: bigint,
  runwayMonths: number | null,
  accountsWithoutBalance = 0,
): HeadlinePart[] {
  const months = Math.floor(runwayMonths ?? 0);
  const lasts: HeadlinePart[] =
    runwayMonths === null
      ? ["."]
      : runwayMonths < 1
        ? [" — ", { text: "less than a month", opens: "runway" }, " at your usual costs."]
        : [
            " — enough for ",
            { text: `about ${months} ${months === 1 ? "month" : "months"}`, opens: "runway" },
            " at your usual costs.",
          ];
  const unknown =
    accountsWithoutBalance > 0
      ? ` (${accountsWithoutBalance} ${accountsWithoutBalance === 1 ? "account doesn't" : "accounts don't"} report a balance, so this may be low.)`
      : "";
  const parts: HeadlinePart[] = [
    "You have ",
    { text: formatRupiahShort(cash), opens: "cash" },
    " in the bank",
    ...lasts,
    unknown,
  ];
  return parts.filter((p) => p !== "");
}

/** The headline as one sentence. */
export const headlineText = (parts: HeadlinePart[]) =>
  parts.map((p) => (typeof p === "string" ? p : p.text)).join("");

/** One sentence about the full months shown (the current month is still running, so it's left out). */
export function trendSentence(months: { came_in: bigint; went_out: bigint }[]) {
  const full = months.slice(0, -1).filter((m) => m.came_in > 0n || m.went_out > 0n);
  if (full.length < 2) return "Not enough months yet to see a pattern.";
  const ahead = full.filter((m) => m.came_in > m.went_out).length;
  if (ahead === full.length)
    return `More came in than went out in every one of the last ${full.length} months.`;
  if (ahead === 0)
    return `More went out than came in in every one of the last ${full.length} months.`;
  return `More came in than went out in ${ahead} of the last ${full.length} months.`;
}
