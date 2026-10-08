import Link from "next/link";
import { GaugeBar, ScoreRing, Sparkline } from "@/components/charts";
import { Card, EmptyState, StatusPill, type Tone } from "@/components/ui";
import { type Direction, healthGauge } from "@/lib/health-gauge";
import { HEALTH_RANK, HEALTH_TONE, type HealthStatus } from "@/lib/health-status";
import { formatRupiahShort } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Business health · Cashflow" };

type Check = {
  question: string;
  /** Short, for the gauge pin and limits. */
  short: (v: number) => string;
  value: (v: number) => string;
  safe: (healthy: number) => string;
  percent: boolean;
  next?: { href: string; label: string };
};

const rupiah = (v: number) =>
  `${v < 0 ? "−" : v > 0 ? "+" : ""}${formatRupiahShort(BigInt(Math.abs(Math.round(v))))}`;
const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

// The five checks as the questions an owner would actually ask.
const CHECKS: Record<string, Check> = {
  runway: {
    question: "How long does the cash last?",
    short: (v) => `${Math.round(v * 10) / 10} mo`,
    value: (v) => `about ${v} months`,
    safe: (h) => `more than ${h} months`,
    percent: false,
  },
  net_cashflow: {
    question: "Is more coming in than going out?",
    short: rupiah,
    value: (v) => `${rupiah(v)} a month`,
    safe: (h) =>
      h === 0 ? "more in than out" : `more than ${formatRupiahShort(BigInt(h))} a month`,
    percent: false,
    next: { href: "/money", label: "See money in & out" },
  },
  late_share: {
    question: "Are customers paying on time?",
    short: pct,
    value: (v) => `${pct(v)} is 30+ days late`,
    safe: (h) => `under ${h}% late`,
    percent: true,
    next: { href: "/customers?show=late", label: "See who is late" },
  },
  renewal_rate: {
    question: "Do customers keep renewing?",
    short: pct,
    value: (v) => `${pct(v)} renewed`,
    safe: (h) => `more than ${h}% renewed`,
    percent: true,
    next: { href: "/customers?show=ended", label: "See who stopped" },
  },
  top_customer_share: {
    question: "Do you rely too much on one customer?",
    short: pct,
    value: (v) => `${pct(v)} from one customer`,
    safe: (h) => `under ${h}% from any one customer`,
    percent: true,
    next: { href: "/customers", label: "See customers" },
  },
};

const STATUS_WORDS: Record<HealthStatus, string> = {
  danger: "Needs attention",
  warning: "Keep an eye on it",
  healthy: "Healthy",
};

const longDay = (d: string) =>
  new Date(`${d}T12:00:00+07:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  });

export default async function HealthPage() {
  const supabase = await createClient();
  const [{ data: snapshots, error: snapshotsError }, { data: limits, error: limitsError }] =
    await Promise.all([
      // the last 60 checks of each: today's checks plus the line of how each one has moved
      supabase
        .from("health_snapshots")
        .select("taken_on, signal, value, status, explanation")
        .order("taken_on", { ascending: false })
        .limit(5 * 60),
      supabase.from("health_thresholds").select("signal, healthy_limit, warning_limit, direction"),
    ]);
  // a failed read must not look like "No data yet"
  const error = snapshotsError ?? limitsError;
  if (error) throw new Error(`Business health didn't load: ${error.message}`);
  const latest = (snapshots ?? []).filter((s) => s.taken_on === snapshots?.[0]?.taken_on);
  const limit = new Map((limits ?? []).map((l) => [l.signal, l]));
  const history = (signal: string) =>
    (snapshots ?? [])
      .filter((s) => s.signal === signal && s.value !== null)
      .map((s) => Number(s.value))
      .reverse();
  // worst first; checks without data yet last
  const rank = (s: { value: unknown; status: string }) =>
    s.value === null ? -1 : HEALTH_RANK[s.status as HealthStatus];
  latest.sort((a, b) => rank(b) - rank(a));
  const statuses = latest.map((s) => (s.value === null ? null : (s.status as HealthStatus)));
  const needAttention = statuses.filter((s) => s === "danger").length;
  const toWatch = statuses.filter((s) => s === "warning").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl md:text-4xl">Business health</h1>
        <p className="text-muted">
          Five simple checks, worst first.
          {latest.length ? ` Checked ${longDay(latest[0].taken_on)}.` : ""}
        </p>
      </div>

      {latest.length ? (
        <>
          <Card className="flex flex-col items-center gap-6 sm:flex-row">
            <ScoreRing statuses={statuses} className="size-32 shrink-0" />
            <div className="flex w-full flex-col gap-3">
              <p className="text-xl font-semibold tracking-tight">
                {needAttention
                  ? `${needAttention} ${needAttention === 1 ? "check needs" : "checks need"} attention`
                  : toWatch
                    ? `${toWatch} ${toWatch === 1 ? "check" : "checks"} to keep an eye on`
                    : "Everything looks healthy"}
              </p>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {latest.map((s, i) => (
                  <li key={s.signal}>
                    <a
                      href={`#${s.signal}`}
                      className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-ground"
                    >
                      <span
                        aria-hidden
                        className={`size-2.5 shrink-0 rounded-full ${DOT[statuses[i] ?? "none"]}`}
                      />
                      <span className="truncate">{CHECKS[s.signal].question}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {latest.map((s) => {
              const check = CHECKS[s.signal];
              const status = s.status as HealthStatus;
              const l = limit.get(s.signal);
              const healthy = Number(l?.healthy_limit ?? 0);
              const warning = l?.warning_limit === null ? null : Number(l?.warning_limit);
              const [label, tone]: [string, Tone] =
                s.value === null
                  ? ["No data yet", "neutral"]
                  : [STATUS_WORDS[status], HEALTH_TONE[status]];
              const value = s.value === null ? null : Number(s.value);
              const gauge = healthGauge(
                value,
                healthy,
                warning,
                (l?.direction ?? "higher_is_better") as Direction,
                check.percent,
              );
              const trend = history(s.signal);
              return (
                <Card
                  key={s.signal}
                  id={s.signal}
                  className="flex scroll-mt-6 flex-col gap-3 border-t-4"
                  style={{
                    borderTopColor: `var(--color-${TOP[value === null ? "none" : status]})`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-base">{check.question}</h2>
                    <StatusPill tone={tone}>{label}</StatusPill>
                  </div>
                  {value === null ? (
                    <p className="text-sm text-muted">{s.explanation}</p>
                  ) : (
                    <>
                      <p className="text-2xl font-semibold tracking-tight tabular-nums">
                        {check.value(value)}
                      </p>
                      <GaugeBar
                        gauge={gauge}
                        format={check.short}
                        label={`${check.value(value)}. Safe: ${check.safe(healthy)}.`}
                      />
                      <p className="text-sm text-muted">{s.explanation}</p>
                    </>
                  )}
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3 text-xs text-muted">
                    <span>Safe: {check.safe(healthy)}</span>
                    {trend.length > 1 ? (
                      <span className="flex items-center gap-2">
                        last {trend.length} days
                        <Sparkline values={trend} className="h-6 w-20" />
                      </span>
                    ) : null}
                  </div>
                  {check.next && s.status !== "healthy" ? (
                    <Link
                      href={check.next.href}
                      className="self-start text-sm font-medium text-brand underline-offset-4 hover:underline"
                    >
                      {check.next.label} →
                    </Link>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState title="Not checked yet">
          The checks run once a day, early in the morning. Come back tomorrow.
        </EmptyState>
      )}
    </div>
  );
}

const DOT = {
  healthy: "bg-in",
  warning: "bg-attention",
  danger: "bg-problem",
  none: "bg-line",
} as const;
const TOP = { healthy: "in", warning: "attention", danger: "problem", none: "line" } as const;
