import { cache } from "react";
import { Cue } from "@/components/cue";
import { type CueId, cueInfo } from "@/lib/home-cues";
import { history, loadSnapshots } from "@/lib/metric-snapshots";
import type { Metric } from "@/lib/metrics";
import {
  loadCashMetrics,
  loadReceivableMetrics,
  loadRenewalsDue,
  loadRevenueMetrics,
  loadSpendingMetrics,
} from "@/lib/metrics-data";
import { formatRupiahShort } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Home's cues (P8-T6). Each one is its own <Suspense> on the page; the loaders are cached for the
// request, so cues of one group (cash, what is owed, …) share a single read.

const cash = cache(async (today: string) => loadCashMetrics(await createClient(), today));
export const owed = cache(async (today: string) =>
  loadReceivableMetrics(await createClient(), today),
);
export const revenue = cache(async (today: string) =>
  loadRevenueMetrics(await createClient(), today),
);
const renewals = cache(async () => loadRenewalsDue(await createClient()));
export const spending = cache(async (today: string) =>
  loadSpendingMetrics(await createClient(), today),
);

const SNAPSHOT_METRICS = [
  "cash",
  "runway",
  "net_cashflow",
  "forecast_low",
  "outstanding",
  "overdue_share",
  "over_90_share",
  "dso",
  "cei",
  "mrr",
  "renewal_rate",
  "top_customer_share",
];
const snapshots = cache(async (today: string) =>
  loadSnapshots(await createClient(), SNAPSHOT_METRICS, today),
);

export const summary = cache(async () => {
  const s = await (await createClient()).rpc("money_summary").single();
  if (s.error) throw new Error(`Couldn't work out this month: ${s.error.message}`);
  return s.data;
});
export const monthly = cache(async () => {
  const m = await (await createClient()).rpc("monthly_in_out");
  if (m.error) throw new Error(`Couldn't work out the months: ${m.error.message}`);
  return m.data ?? [];
});

/** How many rows a filtered Money in & out list has: the cue and its list count the same way. */
async function moneyCount(args: { p_status: string; p_direction?: string }) {
  const r = await (await createClient()).rpc("money_list_summary", args);
  if (r.error) throw new Error(`Couldn't count transactions: ${r.error.message}`);
  return Number((r.data as { count: number }).count);
}

async function count(what: string, query: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: n, error } = await query;
  if (error) throw new Error(`Couldn't count ${what}`);
  return n ?? 0;
}

const big = (v: unknown) => BigInt(String(v ?? "0"));
const plural = (n: number | null, one: string, many: string) => (n === 1 ? one : many);
/** Start of the last 7 Jakarta days (today and the 6 before). */
export const lastSevenDays = () =>
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(Date.now() - 6 * 86_400_000),
  )}T00:00:00+07:00`;

/** A metric as a cue: its trend vs a month ago, its status, and its line from the snapshots. */
async function MetricCue({
  id,
  m,
  unit,
  today,
  caption,
}: {
  id: CueId;
  m: Metric;
  unit: string;
  today: string;
  caption?: string;
}) {
  const { label, wide } = cueInfo(id);
  const line = SNAPSHOT_METRICS.includes(id)
    ? history(await snapshots(today), id, today, m.value).map((p) => Number(p.value))
    : undefined;
  return (
    <Cue
      label={label}
      value={m.value}
      unit={unit}
      href={m.href}
      wide={wide}
      trend={m.trend ? { ...m.trend, against: "vs a month ago" } : undefined}
      status={m.status}
      caption={caption ?? (m.value === null ? "not enough data yet" : undefined)}
      spark={line}
    />
  );
}

export async function HomeCue({ id, today }: { id: CueId; today: string }) {
  const { label } = cueInfo(id);
  const month = `from=${today.slice(0, 8)}01&to=${today}`;
  const props = { id, today };

  switch (id) {
    case "cash":
      return <MetricCue {...props} m={(await cash(today)).cash} unit="rupiah" />;
    case "forecast_low": {
      const low = (await cash(today)).forecastLow;
      return (
        <MetricCue
          {...props}
          m={low}
          unit="rupiah"
          caption={`on ${new Date(low.on).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`}
        />
      );
    }
    case "net_cashflow":
      return (
        <MetricCue
          {...props}
          m={(await cash(today)).net}
          unit="rupiah"
          caption="came in minus went out"
        />
      );
    case "runway":
      return (
        <MetricCue
          {...props}
          m={(await cash(today)).runway}
          unit="months"
          caption="at your usual regular costs"
        />
      );
    case "forecast_off": {
      const off = (await cash(today)).forecastOff;
      return (
        <MetricCue
          {...props}
          m={off}
          unit="%"
          caption={off.value === null ? "scored once a month closes" : "last month"}
        />
      );
    }
    case "came_in":
    case "went_out": {
      const [s, months] = await Promise.all([summary(), monthly()]);
      return (
        <Cue
          wide
          label={label}
          value={big(s?.[id])}
          unit="rupiah"
          href={`/money?dir=${id === "came_in" ? "in" : "out"}&${month}`}
          caption={`usual month ${formatRupiahShort(big(id === "came_in" ? s?.usual_came_in : s?.usual_went_out))}`}
          spark={months.map((m) => Number(m[id]))}
        />
      );
    }
    case "spend_jumps": {
      const flagged = (await spending(today)).byCategory.filter((c) => c.flagged);
      return (
        <Cue
          label={label}
          value={flagged.length}
          unit={plural(flagged.length, "category", "categories")}
          href={flagged[0]?.href ?? `/money?dir=out&${month}`}
          caption={
            flagged.length ? `${flagged[0].category} the most` : "all near their usual month"
          }
        />
      );
    }

    case "outstanding": {
      const ar = await owed(today);
      const pastDue = ar.aging.slice(1).reduce((t, b) => t + b.amount, 0n);
      return (
        <MetricCue
          {...props}
          // coloured by the owner's limit on what is past due
          m={{ ...ar.outstanding, status: ar.overdueShare.status }}
          unit="rupiah"
          caption={pastDue > 0n ? `${formatRupiahShort(pastDue)} is past due` : "nothing past due"}
        />
      );
    }
    case "overdue_share":
      return <MetricCue {...props} m={(await owed(today)).overdueShare} unit="%" />;
    case "over_90_share":
      return <MetricCue {...props} m={(await owed(today)).over90Share} unit="%" />;
    case "dso":
      return (
        <MetricCue
          {...props}
          m={(await owed(today)).dso}
          unit="days"
          caption="customers take, on average"
        />
      );
    case "cei":
      return <MetricCue {...props} m={(await owed(today)).cei} unit="%" caption="last 30 days" />;
    case "mrr": {
      const r = await revenue(today);
      return (
        <MetricCue
          {...props}
          m={r.mrr}
          unit="rupiah"
          caption={`${r.running} running${
            r.movement.added || r.movement.lost
              ? ` · this month +${formatRupiahShort(r.movement.added)} / −${formatRupiahShort(r.movement.lost)}`
              : ""
          }`}
        />
      );
    }
    case "renewal_rate":
      return (
        <MetricCue
          {...props}
          m={(await revenue(today)).renewalRate}
          unit="%"
          caption="last 12 months"
        />
      );
    case "top_customer_share": {
      const c = (await revenue(today)).concentration;
      return <MetricCue {...props} m={c} unit="%" caption={c.customer ?? undefined} />;
    }
    case "renewals_due": {
      const due = (await renewals())[0];
      return (
        <Cue
          label={label}
          value={due.count}
          unit={plural(due.count, "subscription", "subscriptions")}
          href={due.href}
          caption={`${formatRupiahShort(due.value)}${due.risky ? ` · ${due.risky} look risky` : ""}`}
        />
      );
    }

    case "needs_label":
    case "money_in_unmatched": {
      const n = await moneyCount({
        p_status: "needs_label",
        ...(id === "money_in_unmatched" && { p_direction: "in" }),
      });
      return (
        <Cue
          label={label}
          value={n}
          unit={plural(n, "transaction", "transactions")}
          href={`/money?${id === "money_in_unmatched" ? "dir=in&" : ""}status=needs_label`}
          caption={id === "money_in_unmatched" ? "no bill or label yet" : undefined}
        />
      );
    }
    case "late_customers": {
      const supabase = await createClient();
      const n = await count(
        "late customers",
        supabase
          .from("customer_billing")
          .select("id", { count: "exact", head: true })
          .eq("is_late", true),
      );
      return (
        <Cue
          label={label}
          value={n}
          unit={plural(n, "customer", "customers")}
          href="/customers?show=late"
        />
      );
    }
    case "reminders_to_send": {
      const supabase = await createClient();
      const n = await count(
        "reminders",
        supabase.from("reminders_to_send").select("reminder_id", { count: "exact", head: true }),
      );
      return (
        <Cue
          label={label}
          value={n}
          unit={plural(n, "reminder", "reminders")}
          href="/#reminders-to-send"
        />
      );
    }
    case "failed_messages": {
      const supabase = await createClient();
      const n = await count(
        "messages",
        supabase
          .from("reminders")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("scheduled_for", lastSevenDays()),
      );
      return (
        <Cue
          label={label}
          value={n}
          unit={plural(n, "message", "messages")}
          href="/#failed-messages"
          caption="last 7 days"
        />
      );
    }
    case "marked_paid": {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("payments_without_transfer")
        .select("amount_applied::text")
        .gte("created_at", lastSevenDays());
      if (error) throw new Error(`Couldn't read bills marked paid: ${error.message}`);
      const rows = data ?? [];
      return (
        <Cue
          label={label}
          value={rows.length}
          unit={plural(rows.length, "bill", "bills")}
          href="/settings/weekly-summary"
          caption={`last 7 days · ${formatRupiahShort(rows.reduce((t, r) => t + big(r.amount_applied), 0n))}`}
        />
      );
    }
    case "mismatches": {
      const supabase = await createClient();
      const n = await count(
        "balance checks",
        supabase
          .from("balance_checks")
          .select("id", { count: "exact", head: true })
          .eq("checked_on", today)
          .eq("status", "mismatch"),
      );
      return (
        <Cue
          label={label}
          value={n}
          unit={plural(n, "account", "accounts")}
          href="/settings/bank"
          caption="checked today"
        />
      );
    }
  }
  return null; // every cue is handled above
}
