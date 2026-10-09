// The daily metric snapshot (P8-T5): today's metrics, kept so their history survives.
// Taken by the daily job with the service-role client; read back by anyone signed in (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { Forecast } from "./forecast";
import { type InOut, type Metric, monthEnd } from "./metrics";
import { loadCashMetrics, loadReceivableMetrics, loadRevenueMetrics } from "./metrics-data";

export type SnapshotRow = { metric: string; rupiah: bigint | null; value: number | null };

const row = (metric: string, m: Pick<Metric, "value">): SnapshotRow => ({
  metric,
  rupiah: typeof m.value === "bigint" ? m.value : null,
  value: typeof m.value === "number" ? m.value : null,
});

/** What the forecast expects to come in and go out from tomorrow to the end of this month. */
export function forecastForMonth(f: Forecast, today: string): InOut {
  const end = monthEnd(today);
  const these = f.moves.filter((m) => m.date > today && m.date <= end);
  const sum = (dir: "in" | "out") =>
    these.filter((m) => m.direction === dir).reduce((t, m) => t + m.amount, 0n);
  return { came_in: sum("in"), went_out: sum("out") };
}

/** Every metric with one value, as snapshot rows; plus the month's forecast on its first snapshot. */
export function snapshotRows(
  m: {
    cash: Awaited<ReturnType<typeof loadCashMetrics>>;
    ar: Awaited<ReturnType<typeof loadReceivableMetrics>>;
    revenue: Awaited<ReturnType<typeof loadRevenueMetrics>>;
  },
  today: string,
  firstOfMonth: boolean,
): SnapshotRow[] {
  const rows = [
    row("cash", m.cash.cash),
    row("runway", m.cash.runway),
    row("net_cashflow", m.cash.net),
    row("forecast_low", m.cash.forecastLow),
    row("outstanding", m.ar.outstanding),
    row("overdue_share", m.ar.overdueShare),
    row("over_90_share", m.ar.over90Share),
    row("dso", m.ar.dso),
    row("cei", m.ar.cei),
    row("mrr", m.revenue.mrr),
    row("renewal_rate", m.revenue.renewalRate),
    row("top_customer_share", m.revenue.concentration),
  ];
  if (!firstOfMonth) return rows;
  const expected = forecastForMonth(m.cash.forecast, today);
  return [
    ...rows,
    { metric: "forecast_month_in", rupiah: expected.came_in, value: null },
    { metric: "forecast_month_out", rupiah: expected.went_out, value: null },
  ];
}

/** Takes (or retakes: the same day is overwritten) today's snapshot. */
export async function takeMetricSnapshot(db: SupabaseClient<Database>, today: string) {
  const [cash, ar, revenue, kept] = await Promise.all([
    loadCashMetrics(db, today),
    loadReceivableMetrics(db, today),
    loadRevenueMetrics(db, today),
    // has this month's forecast been kept already (on an earlier day)?
    db
      .from("metric_snapshots")
      .select("taken_on")
      .eq("metric", "forecast_month_in")
      .gte("taken_on", `${today.slice(0, 7)}-01`)
      .lt("taken_on", today)
      .limit(1),
  ]);
  if (kept.error) throw new Error(`Couldn't read the snapshots: ${kept.error.message}`);

  const rows = snapshotRows({ cash, ar, revenue }, today, !kept.data?.length).map((r) => ({
    taken_on: today,
    metric: r.metric,
    // as text: exact above 2^53
    rupiah: (r.rupiah === null ? null : String(r.rupiah)) as unknown as number | null,
    value: r.value,
  }));
  const { error } = await db.from("metric_snapshots").upsert(rows);
  if (error) throw new Error(`Couldn't save the metric snapshot: ${error.message}`);
  return rows.length;
}

/** A snapshot row as read back (rupiah as text: exact). */
export type SnapshotRead = {
  taken_on: string;
  metric: string;
  rupiah: string | null;
  value: number | null;
};

/**
 * One metric's line for a sparkline: the kept days, oldest first, with today's live value in
 * place of today's snapshot (which may be from this morning). Days without data are left out.
 */
export function history(
  rows: SnapshotRead[],
  metric: string,
  today: string,
  live: bigint | number | null,
): { day: string; value: bigint | number }[] {
  const kept = rows
    .filter(
      (r) => r.metric === metric && r.taken_on < today && (r.rupiah !== null || r.value !== null),
    )
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on))
    .map((r) => ({
      day: r.taken_on,
      value: r.rupiah !== null ? BigInt(r.rupiah) : Number(r.value),
    }));
  return live === null ? kept : [...kept, { day: today, value: live }];
}

/** The kept snapshots of some metrics over the last `days` days, read as the person signed in. */
export async function loadSnapshots(
  supabase: SupabaseClient<Database>,
  metrics: string[],
  today: string,
  days = 90,
): Promise<SnapshotRead[]> {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  const { data, error } = await supabase
    .from("metric_snapshots")
    .select("taken_on, metric, rupiah::text, value")
    .in("metric", metrics)
    .gte("taken_on", from.toISOString().slice(0, 10))
    .lte("taken_on", today);
  if (error) throw new Error(`Couldn't read the metric history: ${error.message}`);
  return data ?? [];
}
