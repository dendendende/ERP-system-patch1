import { describe, expect, it } from "vitest";
import { lastWeek, weeklySummaryText } from "./weekly-summary";

const M = 1_000_000n;

describe("weekly summary", () => {
  it("covers the week: cash, in and out, who is late, health, manual mark-as-paid, mismatches", () => {
    expect(
      weeklySummaryText({
        weekFrom: "2026-09-21",
        weekTo: "2026-09-27",
        cash: 554_690_000n,
        cameIn: 15n * M,
        wentOut: 20n * M,
        late: [
          { name: "CV Sinar Abadi", owed: 1_500_000n },
          { name: "PT Maju Jaya", owed: 4_900_000n },
        ],
        health: "warning",
        markedPaid: [{ customer: "Toko Berkah", number: "INV-0100", amount: 2n * M, reason: "Paid cash at the office" }],
        mismatches: [{ account: "BCA ••1234", cause: "Some days are missing" }],
      }),
    ).toBe(
      [
        "Week of 21 Sept – 27 Sept",
        "",
        "Cash in the bank: Rp 554,69 jt.",
        "Came in Rp 15 jt, went out Rp 20 jt (−Rp 5 jt).",
        "",
        "Late paying (2):",
        "- CV Sinar Abadi: Rp 1,5 jt",
        "- PT Maju Jaya: Rp 4,9 jt",
        "",
        "Business health: something needs watching.",
        "",
        "Marked paid without a transfer this week — please check:",
        "- Toko Berkah, INV-0100: Rp 2 jt (“Paid cash at the office”)",
        "",
        "Bank balance didn't add up:",
        "- BCA ••1234: Some days are missing",
      ].join("\n"),
    );
  });

  it("a quiet week says so, and leaves out what didn't happen", () => {
    const text = weeklySummaryText({
      weekFrom: "2026-09-21",
      weekTo: "2026-09-27",
      cash: 10n * M,
      cameIn: 3n * M,
      wentOut: 1n * M,
      late: [],
      health: null,
      markedPaid: [],
      mismatches: [],
    });
    expect(text).toContain("(+Rp 2 jt)");
    expect(text).toContain("Nobody is late paying.");
    expect(text).not.toContain("Marked paid");
    expect(text).not.toContain("didn't add up");
  });

  it("last week is Monday to Sunday before today's week", () => {
    expect(lastWeek("2026-10-02")).toEqual({ from: "2026-09-21", to: "2026-09-27" }); // a Friday
    expect(lastWeek("2026-09-28")).toEqual({ from: "2026-09-21", to: "2026-09-27" }); // a Monday
    expect(lastWeek("2026-10-04")).toEqual({ from: "2026-09-21", to: "2026-09-27" }); // a Sunday
  });
});
