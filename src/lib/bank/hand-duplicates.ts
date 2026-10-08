// A statement can bring in money someone already entered by hand. Same account, same direction,
// same amount, within a day = probably the same money. Each hand entry pairs at most once.

export type Movement = { day: string; amount: bigint; direction: "in" | "out" }; // day: YYYY-MM-DD

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/** The hand entries that look like rows of this statement. */
export function handEntriesInStatement<T extends Movement>(statement: Movement[], hand: T[]): T[] {
  const left = [...hand];
  const found: T[] = [];
  for (const row of statement) {
    const i = left.findIndex(
      (h) =>
        h.direction === row.direction && h.amount === row.amount && daysApart(h.day, row.day) <= 1,
    );
    if (i >= 0) found.push(...left.splice(i, 1));
  }
  return found;
}
