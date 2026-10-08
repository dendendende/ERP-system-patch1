import { describe, expect, it } from "vitest";
import { handEntriesInStatement } from "./hand-duplicates";

const m = (day: string, amount: bigint, direction: "in" | "out" = "in", id = "") => ({
  day,
  amount,
  direction,
  id,
});

describe("handEntriesInStatement", () => {
  it("finds a hand entry the statement shows again: same amount and direction, a day apart at most", () => {
    const hand = [m("2026-10-01", 500_000n, "in", "a"), m("2026-10-01", 500_000n, "out", "b")];
    expect(handEntriesInStatement([m("2026-10-02", 500_000n)], hand).map((h) => h.id)).toEqual([
      "a",
    ]);
    expect(handEntriesInStatement([m("2026-10-03", 500_000n)], hand)).toEqual([]);
    expect(handEntriesInStatement([m("2026-10-01", 500_001n)], hand)).toEqual([]);
  });

  it("pairs each hand entry once: two statement rows, one hand entry → one found", () => {
    const hand = [m("2026-10-01", 9n, "in", "a")];
    const statement = [m("2026-10-01", 9n), m("2026-10-01", 9n)];
    expect(handEntriesInStatement(statement, hand)).toHaveLength(1);
  });
});
