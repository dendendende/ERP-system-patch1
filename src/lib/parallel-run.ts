// The parallel run before go-live (P6-T6): the owner's numbers next to the app's, week by week.

export type ParallelWeek = {
  week_start: string; // a Monday, YYYY-MM-DD
  their_came_in: bigint;
  their_went_out: bigint;
  their_cash: bigint;
  their_still_owed: bigint;
  app_came_in: bigint;
  app_went_out: bigint;
  app_cash: bigint;
  app_still_owed: bigint;
};

const LINES = [
  ["came_in", "Came in last week"],
  ["went_out", "Went out last week"],
  ["cash", "Cash in the bank"],
  ["still_owed", "Still owed by customers"],
] as const;

/** One line per number; `difference` is the app's minus theirs (0 = they match). */
export function compareWeek(w: ParallelWeek) {
  return LINES.map(([key, label]) => {
    const theirs = w[`their_${key}`];
    const app = w[`app_${key}`];
    return { key, label, theirs, app, difference: app - theirs };
  });
}

export const weekMatches = (w: ParallelWeek) => compareWeek(w).every((l) => l.difference === 0n);

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Go-live condition: the two most recent weeks recorded are back to back and both match. */
export function readyForGoLive(weeks: ParallelWeek[]): boolean {
  const [latest, before] = [...weeks].sort((a, b) => b.week_start.localeCompare(a.week_start));
  return (
    !!latest &&
    !!before &&
    addDays(before.week_start, 7) === latest.week_start &&
    weekMatches(latest) &&
    weekMatches(before)
  );
}
