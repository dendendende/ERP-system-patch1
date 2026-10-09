// The arithmetic behind the charts (src/components/charts.tsx), kept apart so it can be tested.
// Money stays bigint until the very last step: a share of a total, as a percentage.

/** value as a % of max (one decimal); anything above zero shows at least a sliver. */
export const percent = (value: bigint, max: bigint) =>
  max > 0n ? Math.max(value > 0n ? 2 : 0, Number((value * 1000n) / max) / 10) : 0;

export const biggest = (values: bigint[]) => values.reduce((m, v) => (v > m ? v : m), 0n);
export const sum = (values: bigint[]) => values.reduce((s, v) => s + v, 0n);

/**
 * The `keep` biggest parts, in the order given (so each keeps its colour), and the rest folded
 * into one "Other" at the end: a chart never needs a colour past the palette's last one.
 */
export function foldIntoOther<T extends { label: string; value: bigint }>(
  parts: T[],
  keep: number,
  otherHref: string,
): (T | { label: string; value: bigint; href: string; other: true })[] {
  if (parts.length <= keep) return parts;
  const kept = new Set(
    [...parts].sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0)).slice(0, keep),
  );
  const rest = parts.filter((p) => !kept.has(p));
  return [
    ...parts.filter((p) => kept.has(p)),
    { label: "Other", value: sum(rest.map((p) => p.value)), href: otherHref, other: true },
  ];
}

/** Where each part starts and ends around a ring, as fractions 0–1 of the whole. */
export function arcs(values: bigint[]) {
  const total = sum(values);
  let at = 0n;
  return values.map((v) => {
    const from = total > 0n ? Number((at * 10000n) / total) / 10000 : 0;
    at += v;
    const to = total > 0n ? Number((at * 10000n) / total) / 10000 : 0;
    return { from, to };
  });
}

/**
 * Line points in a 0–100 square box (y grows downward) from a zero base. Each point sits in the
 * middle of its own equal column, so the columns under it can be the click targets.
 */
export function linePoints(values: bigint[], max: bigint) {
  return values.map((v, i) => ({
    x: ((i + 0.5) / values.length) * 100,
    y: 100 - percent(v, max),
  }));
}
