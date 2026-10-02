import { describe, expect, it } from "vitest";
import { forecast, forecastHeadline } from "./forecast";

const M = 1_000_000n;

/*
 Hand calculation (today 10 Jan 2031, bank Rp 10 jt, 90 days → up to 10 Apr):
   11 Jan  +1 jt   bill C, due 1 Jan + 2 days late → already past → tomorrow   = 11.0 jt
   15 Jan  +3 jt   bill A, on time;  −1.2 jt insurance (quarterly, day 15)     = 12.8 jt
   22 Jan  +2 jt   bill B, due 12 Jan, customer usually 10 days late           = 14.8 jt
   31 Jan  −6 jt   rent (day 31)                                               =  8.8 jt
    5 Feb  +4 jt   subscription S                                              = 12.8 jt
   25 Feb  −9 jt   salaries (start in February)                                =  3.8 jt
   28 Feb  −6 jt   rent (day 31 → last day of February)                        = −2.2 jt
    5 Mar  +4 jt   subscription S                                              =  1.8 jt
   25 Mar  −9 jt   salaries                                                    = −7.2 jt
   31 Mar  −6 jt   rent                                                        = −13.2 jt ← lowest
    5 Apr  +4 jt   subscription S                                              = −9.2 jt
 Left out: subscription Y (ends before its next bill), insurance in April (after the 90 days),
 salaries in January (before they started), rent on 30 Apr (after the 90 days).
*/
const result = forecast({
  today: "2031-01-10",
  balance: 10n * M,
  bills: [
    { label: "Bill A", owed: 3n * M, dueOn: "2031-01-15", customerDelayDays: 0 },
    { label: "Bill B", owed: 2n * M, dueOn: "2031-01-12", customerDelayDays: 10 },
    { label: "Bill C", owed: 1n * M, dueOn: "2031-01-01", customerDelayDays: 2 },
  ],
  subscriptions: [
    { label: "Subscription S", price: 4n * M, cycle: "monthly", nextDueOn: "2031-02-05", endDate: null, customerDelayDays: 0 },
    { label: "Subscription Y", price: 50n * M, cycle: "yearly", nextDueOn: "2031-03-01", endDate: "2031-02-15", customerDelayDays: 0 },
  ],
  costs: [
    { label: "Rent", amount: 6n * M, frequency: "monthly", dayOfMonth: 31, startDate: "2030-06-01", endDate: null },
    { label: "Salaries", amount: 9n * M, frequency: "monthly", dayOfMonth: 25, startDate: "2031-02-01", endDate: null },
    { label: "Insurance", amount: 1_200_000n, frequency: "quarterly", dayOfMonth: 15, startDate: "2030-10-15", endDate: null },
  ],
});

const on = (date: string) => result.days.find((d) => d.date === date)?.balance;

describe("forecast — matches the hand calculation", () => {
  it("balance on each day money moves", () => {
    expect(on("2031-01-11")).toBe(11n * M);
    expect(on("2031-01-15")).toBe(12_800_000n);
    expect(on("2031-01-22")).toBe(14_800_000n);
    expect(on("2031-01-31")).toBe(8_800_000n);
    expect(on("2031-02-05")).toBe(12_800_000n);
    expect(on("2031-02-25")).toBe(3_800_000n);
    expect(on("2031-02-28")).toBe(-2_200_000n);
    expect(on("2031-03-05")).toBe(1_800_000n);
    expect(on("2031-03-25")).toBe(-7_200_000n);
    expect(on("2031-03-31")).toBe(-13_200_000n);
    expect(on("2031-04-05")).toBe(-9_200_000n);
    expect(on("2031-04-10")).toBe(-9_200_000n);
  });

  it("covers exactly 90 days, and days without money moving keep the balance", () => {
    expect(result.days).toHaveLength(90);
    expect(result.days[0].date).toBe("2031-01-11");
    expect(result.days[89].date).toBe("2031-04-10");
    expect(on("2031-01-20")).toBe(12_800_000n);
  });

  it("lowest point, and what pushed it there", () => {
    expect(result.lowest).toEqual({ date: "2031-03-31", balance: -13_200_000n });
    expect(result.lowestAfter).toMatchObject({ label: "Salaries", date: "2031-03-25", amount: 9n * M });
  });

  it("every money move in the window, nothing outside it", () => {
    const summary = result.moves.map((m) => `${m.date} ${m.direction} ${m.label}`);
    expect(summary).toEqual([
      "2031-01-11 in Bill C",
      "2031-01-15 out Insurance",
      "2031-01-15 in Bill A",
      "2031-01-22 in Bill B",
      "2031-01-31 out Rent",
      "2031-02-05 in Subscription S",
      "2031-02-25 out Salaries",
      "2031-02-28 out Rent",
      "2031-03-05 in Subscription S",
      "2031-03-25 out Salaries",
      "2031-03-31 out Rent",
      "2031-04-05 in Subscription S",
    ]);
  });

  it("is deterministic", () => {
    const again = forecast({
      today: "2031-01-10",
      balance: 10n * M,
      bills: [{ label: "Bill A", owed: 3n * M, dueOn: "2031-01-15", customerDelayDays: 0 }],
      subscriptions: [],
      costs: [],
    });
    expect(again).toEqual(
      forecast({
        today: "2031-01-10",
        balance: 10n * M,
        bills: [{ label: "Bill A", owed: 3n * M, dueOn: "2031-01-15", customerDelayDays: 0 }],
        subscriptions: [],
        costs: [],
      }),
    );
  });

  it("never dips: the lowest point is today, with nothing to blame", () => {
    const calm = forecast({ today: "2031-01-10", balance: 5n * M, bills: [], subscriptions: [], costs: [] });
    expect(calm.lowest).toEqual({ date: "2031-01-10", balance: 5n * M });
    expect(calm.lowestAfter).toBeNull();
  });
});

describe("forecastHeadline", () => {
  const money = (v: bigint) => `Rp ${v}`;
  it("says where you'll be in 60 days, the lowest point and what caused it, and when money runs out", () => {
    const { headline, warning } = forecastHeadline(result, "2031-01-10", money);
    // day 60 = 11 Mar: 1.8 jt (after the 5 Mar subscription)
    expect(headline).toBe(
      "In 60 days you'll have about Rp 1800000. Lowest point is 31 March, about Rp -13200000, after Salaries.",
    );
    expect(warning).toBe("At this rate the money runs out around 28 February.");
  });

  it("calm: no dip, no warning", () => {
    const calm = forecast({ today: "2031-01-10", balance: 5n * M, bills: [], subscriptions: [], costs: [] });
    expect(forecastHeadline(calm, "2031-01-10", money)).toEqual({
      headline: "In 60 days you'll have about Rp 5000000. It never drops below what's in the bank today.",
      warning: null,
    });
  });
});
