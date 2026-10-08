import { describe, expect, it } from "vitest";
import { along, healthGauge } from "./health-gauge";

describe("healthGauge", () => {
  it("lower is better (late share 10 / 25%): healthy, then watch, then danger", () => {
    const g = healthGauge(30, 10, 25, "lower_is_better", true);
    expect(g.zones).toEqual([
      { from: 0, to: 10, status: "healthy" },
      { from: 10, to: 25, status: "warning" },
      { from: 25, to: 100, status: "danger" },
    ]);
    expect(along(g, g.marker!)).toBe(30);
  });

  it("higher is better (runway 6 / 12 months): stretches past the value and both limits", () => {
    const g = healthGauge(20, 12, 6, "higher_is_better", false);
    expect(g.min).toBe(0);
    expect(g.max).toBe(25);
    expect(g.zones.map((z) => z.status)).toEqual(["danger", "warning", "healthy"]);
    expect(g.zones[0]).toEqual({ from: 0, to: 6, status: "danger" });
  });

  it("net cashflow (no warning limit): zero in the middle, below zero is 'watch'", () => {
    const g = healthGauge(-400_000, 0, null, "higher_is_better", false);
    expect(g.min).toBe(-500_000);
    expect(g.max).toBe(500_000);
    expect(g.zones).toEqual([
      { from: -500_000, to: 0, status: "warning" },
      { from: 0, to: 500_000, status: "healthy" },
    ]);
    expect(along(g, 0)).toBe(50);
  });

  it("no value yet: no marker; a value off the scale sits at the end", () => {
    expect(healthGauge(null, 90, 80, "higher_is_better", true).marker).toBeNull();
    expect(healthGauge(130, 20, 35, "lower_is_better", true).marker).toBe(100);
  });
});
