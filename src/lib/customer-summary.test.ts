import { describe, expect, it } from "vitest";
import { customerHeadline } from "./customer-summary";

const base = { owed: 0n, paid: 0n, dueOn: null, isLate: false, renewsOn: null };

describe("customerHeadline", () => {
  it("says when nothing is owed", () => {
    expect(customerHeadline(base)).toBe("All paid up. Nothing coming up.");
    expect(customerHeadline({ ...base, renewsOn: "2026-10-24" })).toBe(
      "All paid up. Next bill on 24 October.",
    );
  });

  it("says what is waiting, and what is late", () => {
    const waiting = { ...base, owed: 4_900_000n, dueOn: "2026-10-01" };
    expect(customerHeadline(waiting)).toBe("Waiting for Rp 4,9 jt, due 1 October.");
    expect(customerHeadline({ ...waiting, isLate: true })).toBe(
      "Rp 4,9 jt is late — it was due 1 October.",
    );
  });

  it("mentions a part payment", () => {
    const part = { owed: 12_000_000n, paid: 3_000_000n, dueOn: "2026-09-20", isLate: false };
    expect(customerHeadline({ ...part, renewsOn: null })).toBe(
      "Paid part of their bill. Rp 12 jt left, due 20 September.",
    );
    expect(customerHeadline({ ...part, isLate: true, renewsOn: null })).toBe(
      "Paid part of their bill. Rp 12 jt is late — it was due 20 September.",
    );
  });
});
