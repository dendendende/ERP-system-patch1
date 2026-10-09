// The metrics engine (P8-T1, UPGRADE-v2 §4). One pure function per metric, each returning the
// same shape: today's value, the value a month ago, the trend between them, a status from the
// owner's limits (health_thresholds, never hardcoded), and the link to the list that produced it.
// Rupiah stays bigint; percentages and months are worked out from bigints, rounded once, at the end.
import { type Forecast, addDays as shiftDay } from "./forecast";
import type { HealthStatus } from "./health-status";
import { type Trend, trend } from "./trend";

export type Metric<V extends bigint | number = bigint | number> = {
  /** null = not enough data yet */
  value: V | null;
  /** the same metric a month ago (or the period before); null when unknown */
  previous: V | null;
  trend: Trend | null;
  /** null when the metric has no limit, or no value */
  status: HealthStatus | null;
  /** the list that reproduces the number */
  href: string;
};

/** A row of health_thresholds. */
export type Limit = {
  signal: string;
  healthy_limit: number;
  warning_limit: number | null;
  direction: "higher_is_better" | "lower_is_better";
};

/** Thousandths, so rupiah (bigint) and limits (numeric) compare exactly. */
const exact = (x: bigint | number) =>
  typeof x === "bigint" ? x * 1000n : BigInt(Math.round(x * 1000));

/**
 * The boundary rule of health_status() in the database: strictly past the healthy limit is
 * healthy, up to and including the warning limit is warning, beyond it danger. Without a warning
 * limit (net cashflow) the wrong side is only "warning". A DB test keeps the two in step.
 */
export function statusAgainst(
  value: bigint | number | null,
  limit: Limit | undefined,
): HealthStatus | null {
  if (value === null || !limit) return null;
  const v = exact(value);
  const healthy = exact(limit.healthy_limit);
  const warning = limit.warning_limit === null ? null : exact(limit.warning_limit);
  if (limit.direction === "higher_is_better") {
    if (v > healthy) return "healthy";
    return warning === null || v >= warning ? "warning" : "danger";
  }
  if (v < healthy) return "healthy";
  return warning === null || v <= warning ? "warning" : "danger";
}

/** a ÷ b to one decimal, half away from zero (like Postgres round(numeric, 1)). */
export function ratio1(a: bigint, b: bigint): number {
  const abs = (x: bigint) => (x < 0n ? -x : x);
  const tenths = ((abs(a) * 20n) / abs(b) + 1n) / 2n; // twentieths, halved rounding up
  return Number(a < 0n !== b < 0n ? -tenths : tenths) / 10;
}

function metric<V extends bigint | number>(
  value: V | null,
  previous: V | null,
  better: "up" | "down",
  limit: Limit | undefined,
  href: string,
): Metric<V> {
  return {
    value,
    previous,
    trend: value === null || previous === null ? null : trend(value, previous, better),
    status: statusAgainst(value, limit),
    href,
  };
}

// ---- 4.1 Cash and liquidity -------------------------------------------------------------------

/** What money_summary() returns, for one day. */
export type Summary = {
  cash_in_bank: bigint;
  came_in: bigint;
  went_out: bigint;
  recurring_spending: bigint;
};

/** Cash position: the latest balances of every bank account, added up. No limit. */
export const cashPosition = (now: Summary, monthAgo: Summary): Metric<bigint> =>
  metric(now.cash_in_bank, monthAgo.cash_in_bank, "up", undefined, "/settings/bank");

/** Months the cash lasts at the usual regular costs (3 full months' average); null without any. */
const months = (s: Summary) =>
  s.recurring_spending > 0n ? ratio1(s.cash_in_bank, s.recurring_spending) : null;

/**
 * Cash runway (months). Opens the regular costs it divides by: money out, marked regular, in the
 * 3 full months before today's month.
 */
export function runway(
  now: Summary,
  monthAgo: Summary,
  limits: Limit[],
  today: string,
): Metric<number> {
  const thisMonth = `${today.slice(0, 7)}-01`;
  const from = shiftMonth(thisMonth, -3);
  const to = shiftDay(thisMonth, -1);
  return metric(
    months(now),
    months(monthAgo),
    "up",
    limits.find((l) => l.signal === "runway"),
    `/money?dir=out&status=recurring&from=${from}&to=${to}`,
  );
}

/**
 * Net cashflow this month so far: in − out, own-account transfers left out (money_summary does).
 * Compared with last month up to the same day, so a half month never looks like a fall.
 */
export function netCashflow(
  now: Summary,
  monthAgo: Summary,
  limits: Limit[],
  today: string,
): Metric<bigint> {
  return metric(
    now.came_in - now.went_out,
    monthAgo.came_in - monthAgo.went_out,
    "up",
    // it has no warning limit: below the line is "warning"; "danger" (3 bad months) is the health check's
    limits.find((l) => l.signal === "net_cashflow"),
    `/money?from=${today.slice(0, 7)}-01&to=${today}`,
  );
}

/** Forecast low point, next 90 days, against the floor the owner sets. */
export function forecastLow(
  f: Forecast,
  previousLow: bigint | null,
  limits: Limit[],
): Metric<bigint> & { on: string } {
  return {
    ...metric(
      f.lowest.balance,
      previousLow,
      "up",
      limits.find((l) => l.signal === "forecast_low"),
      "/forecast",
    ),
    on: f.lowest.date,
  };
}

/** What the forecast said a month would bring, or what it did bring. */
export type InOut = { came_in: bigint; went_out: bigint };

/**
 * Forecast accuracy for a closed month: how far off the forecast made at its start was, as a % of
 * the money it expected to move — (|in off| + |out off|) ÷ (expected in + expected out) × 100.
 * Lower is better; null when nothing was expected (no % of nothing).
 */
export function forecastOff(
  expected: InOut | null,
  actual: InOut,
  previousOff: number | null,
  limits: Limit[],
): Metric<number> {
  const abs = (x: bigint) => (x < 0n ? -x : x);
  const moved = expected ? expected.came_in + expected.went_out : 0n;
  const off =
    expected && moved > 0n
      ? ratio1(
          (abs(actual.came_in - expected.came_in) + abs(actual.went_out - expected.went_out)) *
            100n,
          moved,
        )
      : null;
  return metric(
    off,
    previousOff,
    "down",
    limits.find((l) => l.signal === "forecast_off"),
    "/forecast",
  );
}

/** A metric_snapshots row as read back (rupiah as text: exact). */
export type Kept = { taken_on: string; metric: string; rupiah: string | null };

/** The forecast low point kept a month ago: that day's snapshot, or the last one in the week before. */
export function keptLow(rows: Kept[], monthAgo: string): bigint | null {
  const hit = rows
    .filter(
      (r) =>
        r.metric === "forecast_low" &&
        r.rupiah !== null &&
        r.taken_on <= monthAgo &&
        r.taken_on >= shiftDay(monthAgo, -7),
    )
    .sort((a, b) => b.taken_on.localeCompare(a.taken_on))[0];
  return hit ? BigInt(hit.rupiah!) : null;
}

/**
 * The forecast kept on a month's first snapshot ("YYYY-MM"), and the days to compare it with:
 * from the day after it was made to the month's end. Null when none was kept, or it was kept on
 * the last day (nothing left to forecast).
 */
export function keptForecast(rows: Kept[], month: string) {
  const on = rows
    .filter((r) => r.metric === "forecast_month_in" && r.taken_on.startsWith(month))
    .map((r) => r.taken_on)
    .sort()[0];
  if (!on || on === monthEnd(on)) return null;
  const kept = (metric: string) =>
    BigInt(rows.find((r) => r.metric === metric && r.taken_on === on)?.rupiah ?? "0");
  return {
    on,
    expected: { came_in: kept("forecast_month_in"), went_out: kept("forecast_month_out") } as InOut,
    actualDays: { p_from: shiftDay(on, 1), p_to: monthEnd(on) },
  };
}

// ---- 4.2 Receivables --------------------------------------------------------------------------
// From receivables_summary(): what was owed at the end of a day, bill by bill, never more than
// was billed. The bill lists arrive in P8-T8; until then the links open the customers list.

/** What receivables_summary() returns, for one day. */
export type Receivables = {
  /** owed per bucket: not due, 1–30, 31–60, 61–90, 90+ days late */
  aging: bigint[];
  sales_90: bigint;
  begin_30: bigint;
  sales_30: bigint;
  voided_30: bigint;
  /** owed 30 days earlier in buckets 0–3, and what of those bills sits one bucket later now */
  migrated_from: bigint[];
  migrated_to: bigint[];
};

export const AGING_BUCKETS = [
  "Not due yet",
  "1–30 days late",
  "31–60 days late",
  "61–90 days late",
  "Over 90 days late",
] as const;

const total = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const LATE = "/customers?show=late";
/** a share in %, one decimal; null of nothing */
const share = (part: bigint, whole: bigint) => (whole > 0n ? ratio1(part * 100n, whole) : null);

/** Total still owed. Its trend has no colour: more owed can be more sales, or slower payers. */
export function outstanding(now: Receivables, monthAgo: Receivables): Metric<bigint> {
  const m = metric(total(now.aging), total(monthAgo.aging), "down", undefined, "/customers");
  return { ...m, trend: m.trend && { ...m.trend, good: null } };
}

/** The aging buckets, each with its amount and share of what is owed. */
export function aging(now: Receivables) {
  const all = total(now.aging);
  return AGING_BUCKETS.map((label, i) => ({
    label,
    amount: now.aging[i],
    share: share(now.aging[i], all),
    href: i === 0 ? "/customers" : LATE,
  }));
}

/** % overdue: past due ÷ total owed × 100. */
export const overdueShare = (now: Receivables, monthAgo: Receivables, limits: Limit[]) =>
  metric(
    share(total(now.aging.slice(1)), total(now.aging)),
    share(total(monthAgo.aging.slice(1)), total(monthAgo.aging)),
    "down",
    limits.find((l) => l.signal === "overdue_share"),
    LATE,
  );

/** % of what is owed that is more than 90 days late. */
export const over90Share = (now: Receivables, monthAgo: Receivables, limits: Limit[]) =>
  metric(
    share(now.aging[4], total(now.aging)),
    share(monthAgo.aging[4], total(monthAgo.aging)),
    "down",
    limits.find((l) => l.signal === "over_90_share"),
    LATE,
  );

/** DSO, days: owed ÷ billed in the last 90 days × 90. "Customers take X days on average to pay you." */
const days = (r: Receivables) =>
  r.sales_90 > 0n ? ratio1(total(r.aging) * 90n, r.sales_90) : null;
export const dso = (now: Receivables, monthAgo: Receivables, limits: Limit[]) =>
  metric(
    days(now),
    days(monthAgo),
    "down",
    limits.find((l) => l.signal === "dso"),
    "/customers",
  );

/**
 * CEI over the last 30 days, %: collected ÷ what could have been collected.
 * collected   = owed at the start + billed − cancelled − owed at the end
 * collectible = owed at the start + billed − cancelled − owed at the end that isn't due yet
 * "You collected X% of what was due." Null when nothing was due.
 */
function collected(r: Receivables) {
  const base = r.begin_30 + r.sales_30 - r.voided_30;
  const collectible = base - r.aging[0];
  return collectible > 0n ? ratio1((base - total(r.aging)) * 100n, collectible) : null;
}
export const cei = (now: Receivables, monthAgo: Receivables, limits: Limit[]) =>
  metric(
    collected(now),
    collected(monthAgo),
    "up",
    limits.find((l) => l.signal === "cei"),
    LATE,
  );

/**
 * Bucket migration, %: of what was owed in a bucket 30 days ago, how much now sits in the next
 * one (still unpaid, a month later). No limit: it is a warning sign to watch, not a target.
 */
export function bucketMigration(now: Receivables, monthAgo: Receivables) {
  const rate = (r: Receivables, i: number) => share(r.migrated_to[i], r.migrated_from[i]);
  return AGING_BUCKETS.slice(0, 4).map((from, i) => ({
    from,
    to: AGING_BUCKETS[i + 1],
    ...metric(rate(now, i), rate(monthAgo, i), "down", undefined, LATE),
  }));
}

// ---- 4.3 Subscription revenue -----------------------------------------------------------------

/** What mrr_summary() returns, for one day. Yearly values are exact; MRR = ARR ÷ 12, rounded. */
export type Mrr = { arr: bigint; active: number; arr_added: bigint; arr_lost: bigint };

/** ÷ 12 to the nearest rupiah (halves up). Only ever for display: the sums stay yearly. */
const monthly = (yearly: bigint) => (yearly + 6n) / 12n;
const RUNNING = "/customers?show=active";

/** MRR: every running subscription's price, as a month (quarterly ÷ 3, yearly ÷ 12). */
export const mrr = (now: Mrr, monthAgo: Mrr): Metric<bigint> =>
  metric(monthly(now.arr), monthly(monthAgo.arr), "up", undefined, RUNNING);

/** ARR: the same, as a year. */
export const arr = (now: Mrr, monthAgo: Mrr): Metric<bigint> =>
  metric(now.arr, monthAgo.arr, "up", undefined, RUNNING);

/**
 * New vs lost MRR this month: added (new, restarted, priced up) − lost (ended, paused, priced
 * down), per subscription since the end of last month. Previous = last month to the same day.
 */
export function mrrMovement(
  now: Mrr,
  monthAgo: Mrr,
): Metric<bigint> & { added: bigint; lost: bigint } {
  const net = (m: Mrr) => monthly(m.arr_added) - monthly(m.arr_lost);
  return {
    ...metric(net(now), net(monthAgo), "up", undefined, RUNNING),
    added: monthly(now.arr_added),
    lost: monthly(now.arr_lost),
  };
}

/** What renewal_counts() returns: subscription bills due in the last 12 months. */
export type Renewals = { renewed: number; lost: number };
const renewedShare = (r: Renewals) =>
  r.renewed + r.lost > 0 ? ratio1(BigInt(r.renewed) * 100n, BigInt(r.renewed + r.lost)) : null;

/** Renewal rate, %: renewed ÷ (renewed + lost) — the same numbers as the health check. */
export const renewalRate = (now: Renewals, monthAgo: Renewals, limits: Limit[]) =>
  metric(
    renewedShare(now),
    renewedShare(monthAgo),
    "up",
    limits.find((l) => l.signal === "renewal_rate"),
    "/customers?show=ended",
  );

/** A row of the renewal pipeline: one subscription renewing soon. */
export type Upcoming = { price: bigint; days_until: number; risky: boolean };

/** Renewals due within 30, 60 and 90 days: how many, worth how much, how many look risky. */
export const renewalsDue = (rows: Upcoming[]) =>
  ([30, 60, 90] as const).map((within) => {
    const due = rows.filter((r) => r.days_until <= within);
    return {
      within,
      count: due.length,
      value: total(due.map((r) => r.price)),
      risky: due.filter((r) => r.risky).length,
      href: `/customers/renewals?within=${within}`,
    };
  });

/** A row of revenue_by_customer() / revenue_by_plan(). */
export type Earned = { name: string | null; total: bigint; href: string };

/** Ranked biggest first, each with its share of the total. Plans without a name are one-off bills. */
export function ranked(rows: Earned[]) {
  const all = total(rows.map((r) => r.total));
  return [...rows]
    .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0))
    .map((r) => ({ ...r, name: r.name ?? "One-off bills", share: share(r.total, all) }));
}

/**
 * Customer concentration, %: the biggest customer's share of the last 12 months' income from
 * bills — the health check's "relying on one customer". Opens that customer.
 */
export function concentration(
  now: Earned[],
  monthAgo: Earned[],
  limits: Limit[],
): Metric<number> & { customer: string | null } {
  const top = (rows: Earned[]) => ranked(rows)[0];
  return {
    ...metric(
      top(now)?.share ?? null,
      top(monthAgo)?.share ?? null,
      "down",
      limits.find((l) => l.signal === "top_customer_share"),
      top(now)?.href ?? "/customers",
    ),
    customer: top(now)?.name ?? null,
  };
}

// ---- 4.4 Spending -----------------------------------------------------------------------------

/** A row of spending_summary(): money out by category and regular vs one-off. */
export type Spent = {
  category_id: string | null;
  category: string | null;
  is_recurring: boolean;
  this_month: bigint;
  last_3_months: bigint;
};

/** % this month is above (or below) the usual month = the 3 months' total ÷ 3; null without a usual. */
const aboveUsual = (now: bigint, last3: bigint) =>
  last3 > 0n ? ratio1((now * 3n - last3) * 100n, last3) : null;

/**
 * Spend by category this month vs its usual month (3-month average), biggest first. A category
 * is flagged when it is at or past the owner's limit above usual (default 30%). This month so far
 * is compared with a whole usual month, so a flag is never just the month's pace.
 */
export function spendByCategory(rows: Spent[], limits: Limit[], today: string) {
  const month = `from=${today.slice(0, 7)}-01&to=${today}`;
  const byCategory = new Map<
    string,
    { id: string | null; name: string; now: bigint; last3: bigint }
  >();
  for (const r of rows) {
    const key = r.category_id ?? "";
    const c = byCategory.get(key) ?? {
      id: r.category_id,
      name: r.category ?? "Needs a label",
      now: 0n,
      last3: 0n,
    };
    c.now += r.this_month;
    c.last3 += r.last_3_months;
    byCategory.set(key, c);
  }
  const limit = limits.find((l) => l.signal === "spend_jump");
  return [...byCategory.values()]
    .sort((a, b) => (b.now > a.now ? 1 : b.now < a.now ? -1 : a.name.localeCompare(b.name)))
    .map((c) => {
      const change = aboveUsual(c.now, c.last3);
      const status = statusAgainst(change, limit);
      return {
        category: c.name,
        thisMonth: c.now,
        usual: (c.last3 + 1n) / 3n, // to the nearest rupiah, for display
        change,
        status,
        flagged: status !== null && status !== "healthy",
        href: `/money?dir=out&${c.id ? `category=${c.id}` : "status=needs_label"}&${month}`,
      };
    });
}

/** Regular costs vs one-off spending this month, each with its usual month. */
export function spendSplit(rows: Spent[], today: string) {
  const part = (recurring: boolean) => {
    const these = rows.filter((r) => r.is_recurring === recurring);
    const now = total(these.map((r) => r.this_month));
    const last3 = total(these.map((r) => r.last_3_months));
    return { thisMonth: now, usual: (last3 + 1n) / 3n, change: aboveUsual(now, last3) };
  };
  const month = `from=${today.slice(0, 7)}-01&to=${today}`;
  return {
    recurring: { ...part(true), href: `/money?dir=out&status=recurring&${month}` },
    oneOff: { ...part(false), href: `/money?dir=out&${month}` },
  };
}

// ---- dates (YYYY-MM-DD, Jakarta calendar days) ------------------------------------------------

const utc = (d: string) => new Date(`${d}T00:00:00Z`);

/** The same day `n` months away, clamped to that month's last day (31 Oct − 1 month = 30 Sep). */
export function shiftMonth(d: string, n: number) {
  const x = utc(d);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, Math.min(x.getUTCDate(), last)))
    .toISOString()
    .slice(0, 10);
}

/** The last day of `day`'s month. */
export const monthEnd = (day: string) => {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
