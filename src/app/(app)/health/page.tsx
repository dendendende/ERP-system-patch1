import Link from "next/link";
import { Card, EmptyState, StatusPill, type Tone } from "@/components/ui";
import { formatRupiahShort } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Business health · Cashflow" };

type Check = {
  question: string;
  value: (v: number | null) => string;
  safe: (healthy: number) => string;
  next?: { href: string; label: string };
};

// The five checks as the questions an owner would actually ask.
const CHECKS: Record<string, Check> = {
  runway: {
    question: "How long does the cash last?",
    value: (v) => (v === null ? "—" : `about ${v} months`),
    safe: (h) => `more than ${h} months`,
  },
  net_cashflow: {
    question: "Is more coming in than going out?",
    value: (v) => (v === null ? "—" : `${v < 0 ? "−" : "+"}${formatRupiahShort(BigInt(Math.abs(Math.round(v))))} a month`),
    safe: (h) => (h === 0 ? "more in than out" : `more than ${formatRupiahShort(BigInt(h))} a month`),
    next: { href: "/money", label: "See money in & out" },
  },
  late_share: {
    question: "Are customers paying on time?",
    value: (v) => (v === null ? "—" : `${v}% is 30+ days late`),
    safe: (h) => `under ${h}% late`,
    next: { href: "/customers?show=late", label: "See who is late" },
  },
  renewal_rate: {
    question: "Do customers keep renewing?",
    value: (v) => (v === null ? "—" : `${v}% renewed`),
    safe: (h) => `more than ${h}% renewed`,
    next: { href: "/customers?show=ended", label: "See who stopped" },
  },
  top_customer_share: {
    question: "Do you rely too much on one customer?",
    value: (v) => (v === null ? "—" : `${v}% from one customer`),
    safe: (h) => `under ${h}% from any one customer`,
    next: { href: "/customers", label: "See customers" },
  },
};

const STATUS: Record<string, [string, Tone, number]> = {
  danger: ["Needs attention", "problem", 2],
  warning: ["Keep an eye on it", "attention", 1],
  healthy: ["Healthy", "in", 0],
};

export default async function HealthPage() {
  const supabase = await createClient();
  const [{ data: snapshots }, { data: limits }] = await Promise.all([
    supabase
      .from("health_snapshots")
      .select("taken_on, signal, value, status, explanation")
      .order("taken_on", { ascending: false })
      .limit(5),
    supabase.from("health_thresholds").select("signal, healthy_limit"),
  ]);
  const latest = (snapshots ?? []).filter((s) => s.taken_on === snapshots?.[0]?.taken_on);
  const healthy = Object.fromEntries((limits ?? []).map((l) => [l.signal, Number(l.healthy_limit)]));
  // worst first
  latest.sort((a, b) => STATUS[b.status][2] - STATUS[a.status][2]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl md:text-4xl">Business health</h1>
        <p className="text-muted">
          Five simple checks, worst first.
          {latest.length
            ? ` Checked ${new Date(`${latest[0].taken_on}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" })}.`
            : ""}
        </p>
      </div>

      {latest.length ? (
        latest.map((s) => {
          const check = CHECKS[s.signal];
          const [label, tone] = s.value === null ? (["No data yet", "neutral"] as const) : STATUS[s.status];
          const value = s.value === null ? null : Number(s.value);
          return (
            <Card key={s.signal} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl">{check.question}</h2>
                <StatusPill tone={tone}>{label}</StatusPill>
              </div>
              {value === null ? null : <p className="text-2xl">{check.value(value)}</p>}
              <p>{s.explanation}</p>
              <p className="text-sm text-muted">Safe: {check.safe(healthy[s.signal] ?? 0)}</p>
              {check.next && s.status !== "healthy" ? (
                <Link href={check.next.href} className="self-start text-sm underline underline-offset-4">
                  {check.next.label}
                </Link>
              ) : null}
            </Card>
          );
        })
      ) : (
        <EmptyState title="Not checked yet">
          The checks run once a day, early in the morning. Come back tomorrow.
        </EmptyState>
      )}
    </div>
  );
}
