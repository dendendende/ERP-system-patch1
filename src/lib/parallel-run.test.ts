import { describe, expect, it } from "vitest";
import { type ParallelWeek, compareWeek, readyForGoLive, weekMatches } from "./parallel-run";

const week = (week_start: string, change: Partial<ParallelWeek> = {}): ParallelWeek => ({
  week_start,
  their_came_in: 10_000_000n,
  their_went_out: 4_000_000n,
  their_cash: 55_000_000n,
  their_still_owed: 3_000_001n,
  app_came_in: 10_000_000n,
  app_went_out: 4_000_000n,
  app_cash: 55_000_000n,
  app_still_owed: 3_000_001n,
  ...change,
});

describe("parallel run", () => {
  it("shows each difference as the app's number minus theirs", () => {
    const lines = compareWeek(week("2026-10-05", { app_went_out: 4_015_000n }));
    expect(lines.find((l) => l.key === "went_out")?.difference).toBe(15_000n);
    expect(lines.filter((l) => l.difference !== 0n)).toHaveLength(1);
  });

  it("one rupiah off is not a match", () => {
    expect(weekMatches(week("2026-10-05", { their_cash: 55_000_001n }))).toBe(false);
    expect(weekMatches(week("2026-10-05"))).toBe(true);
  });

  it("ready only after two matching weeks back to back, the latest ones", () => {
    expect(readyForGoLive([])).toBe(false);
    expect(readyForGoLive([week("2026-10-05")])).toBe(false);
    expect(readyForGoLive([week("2026-10-12"), week("2026-10-05")])).toBe(true);
    // a gap week in between: not back to back
    expect(readyForGoLive([week("2026-10-19"), week("2026-10-05")])).toBe(false);
    // the latest week didn't match, even though two earlier ones did
    expect(
      readyForGoLive([
        week("2026-10-05"),
        week("2026-10-12"),
        week("2026-10-19", { app_came_in: 1n }),
      ]),
    ).toBe(false);
  });
});
