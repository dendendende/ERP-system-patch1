// Gathers what the metrics need, with the signed-in person's own permissions (RLS).
// Sums happen in the database; only a handful of numbers come back, whatever the table size.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { loadForecast } from "./forecast-data";
import {
  type Earned,
  type Limit,
  type Mrr,
  type Receivables,
  type Renewals,
  type Spent,
  type Summary,
  aging,
  arr,
  bucketMigration,
  cashPosition,
  cei,
  concentration,
  dso,
  forecastLow,
  forecastOff,
  mrr,
  keptForecast,
  keptLow,
  mrrMovement,
  netCashflow,
  outstanding,
  over90Share,
  overdueShare,
  ranked,
  renewalRate,
  renewalsDue,
  runway,
  shiftMonth,
  spendByCategory,
  spendSplit,
} from "./metrics";

type Client = SupabaseClient<Database>;

const big = (v: unknown) => BigInt(String(v ?? "0"));

// a failed read must never look like Rp 0
function check(what: string, ...results: { error: { message: string } | null }[]) {
  const error = results.find((r) => r.error)?.error;
  if (error) throw new Error(`Couldn't work out ${what}: ${error.message}`);
}

async function loadLimits(supabase: Client): Promise<Limit[]> {
  const limits = await supabase
    .from("health_thresholds")
    .select("signal, healthy_limit, warning_limit, direction");
  check("the limits", limits);
  return (limits.data ?? []).map((x) => ({
    ...x,
    healthy_limit: Number(x.healthy_limit),
    warning_limit: x.warning_limit === null ? null : Number(x.warning_limit),
  })) as Limit[];
}

export async function loadCashMetrics(supabase: Client, today: string) {
  const aMonthAgo = shiftMonth(today, -1);
  const [now, monthAgo, l, f, kept] = await Promise.all([
    supabase.rpc("money_summary", { p_today: today }).single(),
    supabase.rpc("money_summary", { p_today: aMonthAgo }).single(),
    loadLimits(supabase),
    loadForecast(supabase, today),
    // what the daily snapshots kept: the forecast's low point, and each month's forecast
    supabase
      .from("metric_snapshots")
      .select("taken_on, metric, rupiah::text")
      .in("metric", ["forecast_low", "forecast_month_in", "forecast_month_out"])
      .gte("taken_on", `${shiftMonth(today, -2).slice(0, 7)}-01`)
      .lte("taken_on", today),
  ]);
  check("the cash numbers", now, monthAgo, kept);
  const snaps = kept.data ?? [];

  // the low point a month ago, and a closed month's forecast vs what then came in and went out
  const lowThen = keptLow(snaps, aMonthAgo);
  const score = async (month: string, previous: number | null) => {
    const k = keptForecast(snaps, month);
    if (!k) return forecastOff(null, { came_in: 0n, went_out: 0n }, previous, l);
    const actual = await supabase.rpc("came_in_went_out", k.actualDays).single();
    check("how the forecast did", actual);
    return forecastOff(
      k.expected,
      { came_in: big(actual.data?.came_in), went_out: big(actual.data?.went_out) },
      previous,
      l,
    );
  };
  const before = await score(shiftMonth(today, -2).slice(0, 7), null);
  const last = await score(aMonthAgo.slice(0, 7), before.value);

  const summary = (s: typeof now.data): Summary => ({
    cash_in_bank: big(s?.cash_in_bank),
    came_in: big(s?.came_in),
    went_out: big(s?.went_out),
    recurring_spending: big(s?.recurring_spending),
  });
  const a = summary(now.data);
  const b = summary(monthAgo.data);

  return {
    cash: cashPosition(a, b),
    runway: runway(a, b, l, today),
    net: netCashflow(a, b, l, today),
    forecastLow: forecastLow(f, lowThen, l),
    /** last month's forecast, scored (null until a month has a kept forecast) */
    forecastOff: last,
    /** for the daily snapshot */
    forecast: f,
  };
}

export async function loadReceivableMetrics(supabase: Client, today: string) {
  const [now, monthAgo, top, l] = await Promise.all([
    supabase.rpc("receivables_summary", { p_on: today }).single(),
    supabase.rpc("receivables_summary", { p_on: shiftMonth(today, -1) }).single(),
    supabase.rpc("top_overdue", { p_on: today }),
    loadLimits(supabase),
  ]);
  check("what customers owe", now, monthAgo, top);

  const receivables = (r: typeof now.data): Receivables => ({
    aging: (r?.aging ?? [0, 0, 0, 0, 0]).map(big),
    sales_90: big(r?.sales_90),
    begin_30: big(r?.begin_30),
    sales_30: big(r?.sales_30),
    voided_30: big(r?.voided_30),
    migrated_from: (r?.migrated_from ?? [0, 0, 0, 0]).map(big),
    migrated_to: (r?.migrated_to ?? [0, 0, 0, 0]).map(big),
  });
  const a = receivables(now.data);
  const b = receivables(monthAgo.data);

  return {
    outstanding: outstanding(a, b),
    aging: aging(a),
    overdueShare: overdueShare(a, b, l),
    over90Share: over90Share(a, b, l),
    dso: dso(a, b, l),
    cei: cei(a, b, l),
    migration: bucketMigration(a, b),
    topOverdue: (top.data ?? []).map((t) => ({
      number: t.number,
      customer: t.customer,
      owed: big(t.owed),
      daysLate: t.days_late,
      lastReminded: t.last_reminded,
      href: `/customers/bills?status=late&open=${t.invoice_id}`,
    })),
  };
}

export async function loadRevenueMetrics(supabase: Client, today: string) {
  const monthAgo = shiftMonth(today, -1);
  const [m, mAgo, r, rAgo, byCustomer, byCustomerAgo, byPlan, l] = await Promise.all([
    supabase.rpc("mrr_summary", { p_on: today }).single(),
    supabase.rpc("mrr_summary", { p_on: monthAgo }).single(),
    supabase.rpc("renewal_counts", { p_on: today }).single(),
    supabase.rpc("renewal_counts", { p_on: monthAgo }).single(),
    supabase.rpc("revenue_by_customer", { p_on: today }),
    supabase.rpc("revenue_by_customer", { p_on: monthAgo }),
    supabase.rpc("revenue_by_plan", { p_on: today }),
    loadLimits(supabase),
  ]);
  check("subscription revenue", m, mAgo, r, rAgo, byCustomer, byCustomerAgo, byPlan);

  const toMrr = (x: typeof m.data): Mrr => ({
    arr: big(x?.arr),
    active: x?.active ?? 0,
    arr_added: big(x?.arr_added),
    arr_lost: big(x?.arr_lost),
  });
  const toRenewals = (x: typeof r.data): Renewals => ({
    renewed: x?.renewed ?? 0,
    lost: x?.lost ?? 0,
  });
  const customers = (rows: typeof byCustomer.data): Earned[] =>
    (rows ?? []).map((c) => ({
      name: c.customer,
      total: big(c.total),
      href: `/customers/${c.customer_id}`,
    }));

  return {
    mrr: mrr(toMrr(m.data), toMrr(mAgo.data)),
    arr: arr(toMrr(m.data), toMrr(mAgo.data)),
    running: m.data?.active ?? 0,
    movement: mrrMovement(toMrr(m.data), toMrr(mAgo.data)),
    renewalRate: renewalRate(toRenewals(r.data), toRenewals(rAgo.data), l),
    byCustomer: ranked(customers(byCustomer.data)),
    byPlan: ranked(
      (byPlan.data ?? []).map((p) => ({ name: p.plan, total: big(p.total), href: "/customers" })),
    ),
    concentration: concentration(customers(byCustomer.data), customers(byCustomerAgo.data), l),
  };
}

/** Renewals due in 30 / 60 / 90 days: today only (no history), and kept out of the daily
 * snapshot — the pipeline's "recently paused" flag reads the owner-only change log. */
export async function loadRenewalsDue(supabase: Client) {
  const pipeline = await supabase
    .from("renewal_pipeline")
    .select(
      "price, days_until, paid_late_last_cycle, reminders_waiting, partial_payments, recently_paused",
    );
  check("renewals coming up", pipeline);
  return renewalsDue(
    (pipeline.data ?? []).map((p) => ({
      price: big(p.price),
      days_until: p.days_until ?? 0,
      risky: Boolean(
        p.paid_late_last_cycle || p.reminders_waiting || p.partial_payments || p.recently_paused,
      ),
    })),
  );
}

export async function loadSpendingMetrics(supabase: Client, today: string) {
  const [spent, payees, l] = await Promise.all([
    supabase.rpc("spending_summary", { p_on: today }),
    supabase.rpc("top_payees", { p_on: today }),
    loadLimits(supabase),
  ]);
  check("spending", spent, payees);

  const rows: Spent[] = (spent.data ?? []).map((r) => ({
    ...r,
    this_month: big(r.this_month),
    last_3_months: big(r.last_3_months),
  }));
  const month = `from=${today.slice(0, 7)}-01&to=${today}`;
  return {
    byCategory: spendByCategory(rows, l, today),
    split: spendSplit(rows, today),
    topPayees: (payees.data ?? []).map((p) => ({
      payee: p.payee,
      /** false = the bank's description: no name was typed in "who" */
      named: p.named,
      total: big(p.total),
      payments: p.payments,
      href: `/money?dir=out&q=${encodeURIComponent(p.payee.slice(0, 100))}&${month}`,
    })),
  };
}
