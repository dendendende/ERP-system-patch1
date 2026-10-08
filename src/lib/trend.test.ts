import { describe, expect, it } from "vitest";
import { trend } from "./trend";

describe("trend", () => {
  it("money in going up is good news, to one decimal", () => {
    expect(trend(11_500_000n, 10_000_000n, "up")).toEqual({
      direction: "up",
      percent: 15,
      good: true,
    });
    expect(trend(10_001_000n, 10_000_000n, "up").percent).toBe(0); // 0.01% rounds down to 0.0
  });

  it("money out going up is bad news", () => {
    expect(trend(12_000_000n, 10_000_000n, "down")).toEqual({
      direction: "up",
      percent: 20,
      good: false,
    });
    expect(trend(8_000_000n, 10_000_000n, "down")).toEqual({
      direction: "down",
      percent: -20,
      good: true,
    });
  });

  it("exact beyond 2^53: one rupiah's difference on a huge amount still counts", () => {
    const big = 9_007_199_254_740_993n;
    expect(trend(big + 1n, big, "up").direction).toBe("up");
  });

  it("nothing before: up, but no percentage; unchanged: flat", () => {
    expect(trend(5n, 0n, "up")).toEqual({ direction: "up", percent: null, good: true });
    expect(trend(3, 3, "down")).toEqual({ direction: "flat", percent: 0, good: null });
  });

  it("counts and ratios keep their decimals; a negative start compares by its size", () => {
    expect(trend(4.5, 4, "up").percent).toBe(12.5);
    expect(trend(-50n, -100n, "up")).toEqual({ direction: "up", percent: 50, good: true });
  });
});
