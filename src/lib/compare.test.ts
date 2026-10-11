import { describe, expect, it } from "vitest";
import { changeWords, fromTop, readVs, shiftBack, shiftForward } from "./compare";

describe("period comparison", () => {
  it("reads only the two choices from the address", () => {
    expect(readVs("month")).toBe("month");
    expect(readVs(["year"])).toBe("year");
    expect(readVs("week")).toBeNull();
    expect(readVs(undefined)).toBeNull();
  });

  it("shifts to the same day a month or a year before, at most the month's last day", () => {
    expect(shiftBack("2026-03-31", "month")).toBe("2026-02-28");
    expect(shiftBack("2024-03-31", "month")).toBe("2024-02-29");
    expect(shiftBack("2026-10-11", "year")).toBe("2025-10-11");
    expect(shiftForward("2025-09-01", "year")).toBe("2026-09-01");
    expect(shiftForward("2026-09-01", "month")).toBe("2026-10-01");
  });

  it("says which way and by how much, rounded; nothing before is new", () => {
    expect(changeWords(112n, 100n)).toBe("↑ 12%");
    expect(changeWords(95n, 100n)).toBe("↓ 5%");
    expect(changeWords(1_004n, 1_000n)).toBe("same");
    expect(changeWords(5n, 0n)).toBe("new");
    expect(changeWords(0n, 0n)).toBe("same");
    expect(changeWords(0n, 7n)).toBe("↓ 100%");
    // exact on rupiah far above 2^53
    expect(changeWords(20_000_000_000_000_000n, 10_000_000_000_000_000n)).toBe("↑ 100%");
  });
});

describe("fromTop", () => {
  it("missing from a full top list is unknown; from a shorter one it was nothing", () => {
    const full = new Map(["a", "b", "c"].map((k, i) => [k, BigInt(i + 1)]));
    expect(fromTop(full, "b", 3)).toBe(2n);
    expect(fromTop(full, "z", 3)).toBeNull();
    expect(fromTop(new Map([["a", 5n]]), "z", 6)).toBe(0n);
  });
});
