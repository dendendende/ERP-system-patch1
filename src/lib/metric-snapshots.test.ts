import { describe, expect, it } from "vitest";
import { forecast } from "./forecast";
import { forecastForMonth, history, snapshotRows } from "./metric-snapshots";
import { type Kept, keptForecast, keptLow, monthEnd } from "./metrics";

const M = 1_000_000n;

describe("monthEnd", () => {
  it("knows short months and leap years", () => {
    expect(monthEnd("2026-10-09")).toBe("2026-10-31");
    expect(monthEnd("2026-11-30")).toBe("2026-11-30");
    expect(monthEnd("2028-02-03")).toBe("2028-02-29");
  });
});

describe("forecastForMonth", () => {
  it("adds up what the forecast expects from tomorrow to the month's end, nothing later", () => {
    const f = forecast({
      today: "2026-10-09",
      balance: 50n * M,
      bills: [
        { label: "A", owed: 5n * M, dueOn: "2026-10-20", customerDelayDays: 0 },
        { label: "B", owed: 7n * M, dueOn: "2026-11-02", customerDelayDays: 0 }, // November
        { label: "C", owed: 2n * M, dueOn: "2026-10-01", customerDelayDays: 0 }, // late: tomorrow
      ],
      subscriptions: [],
      costs: [
        {
          label: "Rent",
          amount: 12n * M,
          frequency: "monthly",
          dayOfMonth: 25,
          startDate: "2026-01-25",
          endDate: null,
        },
      ],
    });
    expect(forecastForMonth(f, "2026-10-09")).toEqual({ came_in: 7n * M, went_out: 12n * M });
  });
});

describe("snapshotRows", () => {
  const m = (value: bigint | number | null) => ({ value });
  const metrics = {
    cash: {
      cash: m(9n * M),
      runway: m(13),
      net: m(-2n * M),
      forecastLow: m(1n * M),
      forecast: forecast({
        today: "2026-10-01",
        balance: 0n,
        bills: [],
        subscriptions: [],
        costs: [],
      }),
    },
    ar: {
      outstanding: m(4n * M),
      overdueShare: m(10.5),
      over90Share: m(0),
      dso: m(null),
      cei: m(97.1),
    },
    revenue: { mrr: m(3n * M), renewalRate: m(null), concentration: m(20) },
  } as never;

  it("rupiah goes to the rupiah column, ratios to value, unknowns to neither", () => {
    const rows = snapshotRows(metrics, "2026-10-02", false);
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.metric === "cash")).toEqual({
      metric: "cash",
      rupiah: 9n * M,
      value: null,
    });
    expect(rows.find((r) => r.metric === "runway")).toEqual({
      metric: "runway",
      rupiah: null,
      value: 13,
    });
    expect(rows.find((r) => r.metric === "dso")).toEqual({
      metric: "dso",
      rupiah: null,
      value: null,
    });
  });

  it("the month's first snapshot also keeps what the forecast expects for the month", () => {
    const rows = snapshotRows(metrics, "2026-10-01", true);
    expect(rows.map((r) => r.metric).slice(-2)).toEqual([
      "forecast_month_in",
      "forecast_month_out",
    ]);
  });
});

describe("reading the kept snapshots back", () => {
  const rows: Kept[] = [
    { taken_on: "2026-09-02", metric: "forecast_low", rupiah: "1000" },
    { taken_on: "2026-09-05", metric: "forecast_low", rupiah: "3000" },
    { taken_on: "2026-09-03", metric: "forecast_month_in", rupiah: "50" },
    { taken_on: "2026-09-03", metric: "forecast_month_out", rupiah: "30" },
    { taken_on: "2026-09-04", metric: "forecast_month_in", rupiah: "999" }, // not the first: ignored
    { taken_on: "2026-08-31", metric: "forecast_month_in", rupiah: "1" }, // kept on the last day
  ];

  it("the low point a month ago: that day, or the last one in the week before", () => {
    expect(keptLow(rows, "2026-09-09")).toBe(3000n);
    expect(keptLow(rows, "2026-09-04")).toBe(1000n);
    expect(keptLow(rows, "2026-09-20")).toBeNull(); // more than a week old
  });

  it("a month's forecast: from its first snapshot, compared from the next day to the month's end", () => {
    expect(keptForecast(rows, "2026-09")).toEqual({
      on: "2026-09-03",
      expected: { came_in: 50n, went_out: 30n },
      actualDays: { p_from: "2026-09-04", p_to: "2026-09-30" },
    });
    expect(keptForecast(rows, "2026-08")).toBeNull(); // nothing left of August to forecast
    expect(keptForecast(rows, "2026-07")).toBeNull();
  });

  it("history: kept days oldest first, today live, empty days left out", () => {
    const kept = [
      { taken_on: "2026-10-08", metric: "cash", rupiah: "20", value: null },
      { taken_on: "2026-10-07", metric: "cash", rupiah: "10", value: null },
      { taken_on: "2026-10-06", metric: "cash", rupiah: null, value: null },
      { taken_on: "2026-10-09", metric: "cash", rupiah: "25", value: null }, // this morning's
      { taken_on: "2026-10-08", metric: "dso", rupiah: null, value: 30.5 },
    ];
    expect(history(kept, "cash", "2026-10-09", 27n)).toEqual([
      { day: "2026-10-07", value: 10n },
      { day: "2026-10-08", value: 20n },
      { day: "2026-10-09", value: 27n },
    ]);
    expect(history(kept, "dso", "2026-10-09", null)).toEqual([{ day: "2026-10-08", value: 30.5 }]);
  });
});
