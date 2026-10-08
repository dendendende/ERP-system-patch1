import { describe, expect, it } from "vitest";
import { visibleRange } from "./virtual-rows";

describe("visibleRange", () => {
  it("list starts below the fold: the first rows, never negative", () => {
    expect(visibleRange(-300, 800, 40, 50_000, 5)).toEqual({ start: 0, end: 18 });
  });

  it("scrolled into the middle: what's on screen plus overscan both sides", () => {
    // offset 4000px = row 100; 800px viewport = 20 rows
    expect(visibleRange(4000, 800, 40, 50_000, 5)).toEqual({ start: 95, end: 125 });
  });

  it("at the end: stops at the last row", () => {
    expect(visibleRange(40 * 49_990, 800, 40, 50_000, 5)).toEqual({ start: 49_985, end: 50_000 });
  });

  it("scrolled past a short list: renders nothing rather than going out of range", () => {
    expect(visibleRange(10_000, 800, 40, 10, 5)).toEqual({ start: 10, end: 10 });
    expect(visibleRange(0, 800, 40, 0)).toEqual({ start: 0, end: 0 });
  });
});
