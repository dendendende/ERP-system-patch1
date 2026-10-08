import { describe, expect, it } from "vitest";
import { toWhatsappNumber } from "./phone";

describe("toWhatsappNumber", () => {
  it("accepts the usual Indonesian ways of writing a number", () => {
    for (const typed of [
      "0812-3456-7890",
      "0812 3456 7890",
      "6281234567890",
      "+62 812 3456 7890",
      "(0812) 3456.7890",
    ]) {
      expect(toWhatsappNumber(typed), typed).toBe("+6281234567890");
    }
  });

  it("keeps other countries' numbers written with +", () => {
    expect(toWhatsappNumber("+65 9123 4567")).toBe("+6591234567");
  });

  it("refuses what can't be a phone number", () => {
    for (const typed of ["", "abc", "812345", "0812", "+0812345678", "81234567890"]) {
      expect(toWhatsappNumber(typed), typed).toBeNull();
    }
  });
});
