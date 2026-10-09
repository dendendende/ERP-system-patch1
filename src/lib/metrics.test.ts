import { describe, expect, it } from "vitest";
import { forecast } from "./forecast";
import {
  type Limit,
  type Receivables,
  type Summary,
  bucketMigration,
  cashPosition,
  cei,
  concentration,
  dso,
  forecastLow,
  forecastOff,
  mrr,
  mrrMovement,
  netCashflow,
  outstanding,
  overdueShare,
  ranked,
  ratio1,
  renewalsDue,
  runway,
  shiftMonth,
  statusAgainst,
} from "./metrics";

const M = 1_000_000n;

// the defaults seeded in the database
const LIMITS: Limit[] = [
  { signal: "runway", healthy_limit: 12, warning_limit: 6, direction: "higher_is_better" },
  { signal: "net_cashflow", healthy_limit: 0, warning_limit: null, direction: "higher_is_better" },
  { signal: "forecast_low", healthy_limit: 0, warning_limit: 0, direction: "higher_is_better" },
  { signal: "forecast_off", healthy_limit: 10, warning_limit: 20, direction: "lower_is_better" },
];
const limit = (s: string) => LIMITS.find((l) => l.signal === s);

// 15 Oct; a month ago is 15 Sep
const now: Summary = {
  cash_in_bank: 130n * M,
  came_in: 40n * M,
  went_out: 25n * M,
  recurring_spending: 10n * M,
};
const before: Summary = {
  cash_in_bank: 100n * M,
  came_in: 20n * M,
  went_out: 30n * M,
  recurring_spending: 8n * M,
};

describe("statusAgainst (the same boundaries as health_status in the database)", () => {
  it("higher is better: past the safe line healthy, down to the danger line warning, below danger", () => {
    expect(statusAgainst(12.1, limit("runway"))).toBe("healthy");
    expect(statusAgainst(12, limit("runway"))).toBe("warning");
    expect(statusAgainst(6, limit("runway"))).toBe("warning");
    expect(statusAgainst(5.9, limit("runway"))).toBe("danger");
  });
  it("lower is better", () => {
    expect(statusAgainst(9.9, limit("forecast_off"))).toBe("healthy");
    expect(statusAgainst(10, limit("forecast_off"))).toBe("warning");
    expect(statusAgainst(20, limit("forecast_off"))).toBe("warning");
    expect(statusAgainst(20.1, limit("forecast_off"))).toBe("danger");
  });
  it("rupiah compare exactly, and no danger line means only warning", () => {
    expect(statusAgainst(1n, limit("net_cashflow"))).toBe("healthy");
    expect(statusAgainst(0n, limit("net_cashflow"))).toBe("warning");
    expect(statusAgainst(-900n * M, limit("net_cashflow"))).toBe("warning");
    expect(statusAgainst(-1n, limit("forecast_low"))).toBe("danger");
  });
  it("no value or no limit: no status", () => {
    expect(statusAgainst(null, limit("runway"))).toBeNull();
    expect(statusAgainst(5, undefined)).toBeNull();
  });
});

describe("ratio1", () => {
  it("one decimal, half away from zero, like Postgres round(x, 1)", () => {
    expect(ratio1(130n * M, 10n * M)).toBe(13);
    expect(ratio1(100n, 8n)).toBe(12.5);
    expect(ratio1(49n, 20n)).toBe(2.5); // 2.45
    expect(ratio1(4899n, 2000n)).toBe(2.4); // 2.4495
    expect(ratio1(-49n, 20n)).toBe(-2.5);
    expect(ratio1(1n, 3n)).toBe(0.3);
  });
});

describe("shiftMonth", () => {
  it("same day a month away, clamped to short months", () => {
    expect(shiftMonth("2026-10-15", -1)).toBe("2026-09-15");
    expect(shiftMonth("2026-10-31", -1)).toBe("2026-09-30");
    expect(shiftMonth("2028-03-31", -1)).toBe("2028-02-29");
    expect(shiftMonth("2026-01-10", -3)).toBe("2025-10-10");
  });
});

describe("cash metrics on a fixed month (hand-calculated)", () => {
  it("cash position: 130 jt now, 100 jt a month ago, up 30%; no limit, opens the bank accounts", () => {
    expect(cashPosition(now, before)).toEqual({
      value: 130n * M,
      previous: 100n * M,
      trend: { direction: "up", percent: 30, good: true },
      status: null,
      href: "/settings/bank",
    });
  });

  it("runway: 130 ÷ 10 = 13 months (healthy), a month ago 100 ÷ 8 = 12.5; opens the regular costs it divides by", () => {
    expect(runway(now, before, LIMITS, "2026-10-15")).toEqual({
      value: 13,
      previous: 12.5,
      trend: { direction: "up", percent: 4, good: true },
      status: "healthy",
      href: "/money?dir=out&status=recurring&from=2026-07-01&to=2026-09-30",
    });
  });

  it("runway without any regular costs is unknown, not infinite", () => {
    const r = runway({ ...now, recurring_spending: 0n }, before, LIMITS, "2026-10-15");
    expect(r.value).toBeNull();
    expect(r.trend).toBeNull();
    expect(r.status).toBeNull();
  });

  it("net cashflow: 40 − 25 = +15 jt vs −10 jt by the same day last month; opens this month's money", () => {
    expect(netCashflow(now, before, LIMITS, "2026-10-15")).toEqual({
      value: 15n * M,
      previous: -10n * M,
      trend: { direction: "up", percent: 250, good: true },
      status: "healthy",
      href: "/money?from=2026-10-01&to=2026-10-15",
    });
    expect(netCashflow(before, now, LIMITS, "2026-10-15").status).toBe("warning");
  });

  it("forecast low point: the lowest day of the forecast, against the owner's floor", () => {
    const f = forecast({
      today: "2026-10-15",
      balance: 10n * M,
      bills: [{ label: "A", owed: 5n * M, dueOn: "2026-10-25", customerDelayDays: 0 }],
      subscriptions: [],
      costs: [
        {
          label: "Rent",
          amount: 12n * M,
          frequency: "monthly",
          dayOfMonth: 20,
          startDate: "2026-01-20",
          endDate: null,
        },
      ],
    });
    // 10 − 12 on 20 Oct = −2; +5 on 25 Oct = 3; −12 on 20 Nov = −9; −12 on 20 Dec = −21
    const low = forecastLow(f, null, LIMITS);
    expect(low).toMatchObject({
      value: -21n * M,
      on: "2026-12-20",
      status: "danger",
      href: "/forecast",
      trend: null,
    });
  });

  it("forecast off: (|in off| + |out off|) ÷ what it expected to move", () => {
    // expected 50 in / 30 out; actually 44 in / 32 out → (6 + 2) ÷ 80 = 10% → warning (not under 10)
    const off = forecastOff(
      { came_in: 50n * M, went_out: 30n * M },
      { came_in: 44n * M, went_out: 32n * M },
      12.5,
      LIMITS,
    );
    expect(off).toEqual({
      value: 10,
      previous: 12.5,
      trend: { direction: "down", percent: -20, good: true },
      status: "warning",
      href: "/forecast",
    });
    // nothing expected (or no forecast kept for that month): no score
    expect(
      forecastOff({ came_in: 0n, went_out: 0n }, { came_in: 1n, went_out: 0n }, null, LIMITS).value,
    ).toBeNull();
    expect(forecastOff(null, { came_in: 1n, went_out: 0n }, null, LIMITS).value).toBeNull();
  });
});

describe("receivables metrics: edge cases", () => {
  const empty: Receivables = {
    aging: [0n, 0n, 0n, 0n, 0n],
    sales_90: 0n,
    begin_30: 0n,
    sales_30: 0n,
    voided_30: 0n,
    migrated_from: [0n, 0n, 0n, 0n],
    migrated_to: [0n, 0n, 0n, 0n],
  };
  const owed: Receivables = {
    ...empty,
    aging: [6n * M, 2n * M, 0n, 0n, 2n * M],
    sales_90: 30n * M,
  };

  it("nothing owed and nothing billed: no shares, no DSO, no CEI — never a divide by zero", () => {
    expect(overdueShare(empty, empty, []).value).toBeNull();
    expect(dso(empty, empty, []).value).toBeNull();
    expect(cei(empty, empty, []).value).toBeNull();
    expect(bucketMigration(empty, empty).every((m) => m.value === null)).toBe(true);
  });

  it("more owed than a month ago is shown as a change, not as good or bad news", () => {
    expect(outstanding(owed, empty).trend).toEqual({ direction: "up", percent: null, good: null });
    expect(outstanding(owed, { ...owed, aging: [5n * M, 0n, 0n, 0n, 0n] }).trend).toEqual({
      direction: "up",
      percent: 100,
      good: null,
    });
  });

  it("DSO falls when customers pay faster: green", () => {
    // 10 jt owed on 30 jt billed = 30 days; a month ago 20 on 30 = 60 days
    const before = { ...owed, aging: [12n * M, 4n * M, 0n, 0n, 4n * M] };
    expect(dso(owed, before, [])).toMatchObject({
      value: 30,
      previous: 60,
      trend: { direction: "down", good: true },
    });
  });
});

describe("subscription revenue: pure parts", () => {
  it("renewals due within 30 / 60 / 90 days add up, risky ones counted", () => {
    const rows = [
      { price: 10n * M, days_until: 3, risky: true },
      { price: 4n * M, days_until: 30, risky: false },
      { price: 6n * M, days_until: 45, risky: true },
      { price: 12n * M, days_until: 90, risky: false },
    ];
    expect(renewalsDue(rows)).toEqual([
      { within: 30, count: 2, value: 14n * M, risky: 1, href: "/customers/renewals?within=30" },
      { within: 60, count: 3, value: 20n * M, risky: 2, href: "/customers/renewals?within=60" },
      { within: 90, count: 4, value: 32n * M, risky: 2, href: "/customers/renewals?within=90" },
    ]);
  });

  it("ranked: biggest first, shares of the total, nameless plan = one-off bills; empty stays empty", () => {
    expect(
      ranked([
        { name: null, total: 1n, href: "/a" },
        { name: "Pro", total: 3n, href: "/b" },
      ]).map((r) => [r.name, r.share]),
    ).toEqual([
      ["Pro", 75],
      ["One-off bills", 25],
    ]);
    expect(ranked([])).toEqual([]);
    expect(concentration([], [], []).value).toBeNull();
  });

  it("MRR rounds the yearly sum once: 3 quarterly plans of Rp 100 = Rp 1.200 a year = Rp 100 a month", () => {
    const m = { arr: 1200n, active: 3, arr_added: 7n, arr_lost: 0n };
    expect(mrr(m, m).value).toBe(100n);
    expect(mrrMovement(m, m).added).toBe(1n); // 7 ÷ 12 = 0.58 → 1
  });
});
