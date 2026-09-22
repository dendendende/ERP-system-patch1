import { describe, expect, it } from "vitest";
import { formatRupiah, formatRupiahShort, parseRupiahInput } from "./money";

describe("formatRupiah", () => {
  it("groups thousands with dots", () => {
    expect(formatRupiah(12_000_284n)).toBe("Rp 12.000.284");
    expect(formatRupiah(0n)).toBe("Rp 0");
    expect(formatRupiah(999n)).toBe("Rp 999");
    expect(formatRupiah(1_000n)).toBe("Rp 1.000");
  });

  it("handles negatives and values beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatRupiah(-5_000n)).toBe("−Rp 5.000");
    expect(formatRupiah(9_007_199_254_740_993n)).toBe("Rp 9.007.199.254.740.993");
  });
});

describe("formatRupiahShort", () => {
  it("uses jt / M / rb / T units", () => {
    expect(formatRupiahShort(12_000_284n)).toBe("Rp 12 jt");
    expect(formatRupiahShort(2_650_000_000n)).toBe("Rp 2,65 M");
    expect(formatRupiahShort(1_500n)).toBe("Rp 1,5 rb");
    expect(formatRupiahShort(3_000_000_000_000n)).toBe("Rp 3 T");
    expect(formatRupiahShort(950n)).toBe("Rp 950");
  });

  it("rounds half-up to 2 decimals", () => {
    expect(formatRupiahShort(2_655_000_000n)).toBe("Rp 2,66 M");
    expect(formatRupiahShort(2_654_999_999n)).toBe("Rp 2,65 M");
    expect(formatRupiahShort(1_050_000n)).toBe("Rp 1,05 jt");
  });

  it("promotes to the next unit when rounding reaches 1000", () => {
    expect(formatRupiahShort(999_999_999n)).toBe("Rp 1 M");
    expect(formatRupiahShort(999_994_999n)).toBe("Rp 999,99 jt");
  });

  it("handles negatives", () => {
    expect(formatRupiahShort(-12_000_000n)).toBe("−Rp 12 jt");
  });
});

describe("parseRupiahInput", () => {
  it("reads amounts the way people type them", () => {
    expect(parseRupiahInput("1.500.000")).toBe(1_500_000n);
    expect(parseRupiahInput("1 500 000")).toBe(1_500_000n);
    expect(parseRupiahInput("1500000")).toBe(1_500_000n);
    expect(parseRupiahInput("9007199254740993")).toBe(9_007_199_254_740_993n);
  });

  it("refuses anything that isn't whole rupiah", () => {
    for (const bad of ["", "0", "-5000", "1,5", "12.50 rb", "Rp 1000", "abc"]) {
      expect(parseRupiahInput(bad), bad).toBeNull();
    }
  });
});
