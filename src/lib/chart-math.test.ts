import { describe, expect, it } from "vitest";
import { arcs, foldIntoOther, linePoints, percent } from "./chart-math";

describe("chart maths", () => {
  it("scales to the biggest, and never hides a small non-zero value", () => {
    expect(percent(50n, 200n)).toBe(25);
    expect(percent(1n, 1_000_000_000n)).toBe(2);
    expect(percent(0n, 200n)).toBe(0);
    expect(percent(5n, 0n)).toBe(0);
  });

  it("keeps the biggest parts in their own order and folds the rest into Other", () => {
    const parts = ["A", "B", "C", "D"].map((label, i) => ({
      label,
      value: BigInt([5, 1, 9, 2][i]!),
    }));
    expect(foldIntoOther(parts, 4, "/x")).toBe(parts);
    const folded = foldIntoOther(parts, 2, "/other");
    expect(folded.map((p) => [p.label, p.value])).toEqual([
      ["A", 5n],
      ["C", 9n],
      ["Other", 3n],
    ]);
    expect(folded[2]).toMatchObject({ href: "/other", other: true });
  });

  it("goes round the ring once, part after part", () => {
    expect(arcs([1n, 1n, 2n])).toEqual([
      { from: 0, to: 0.25 },
      { from: 0.25, to: 0.5 },
      { from: 0.5, to: 1 },
    ]);
    expect(arcs([0n, 0n])).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 0 },
    ]);
  });

  it("puts each line point in the middle of its column, from a zero base", () => {
    expect(linePoints([0n, 50n, 100n, 25n], 100n)).toEqual([
      { x: 12.5, y: 100 },
      { x: 37.5, y: 50 },
      { x: 62.5, y: 0 },
      { x: 87.5, y: 75 },
    ]);
  });
});
