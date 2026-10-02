import Link from "next/link";
import { Card, StatusPill, type Tone } from "@/components/ui";
import { canAccess } from "@/lib/auth/routes";
import { currentSyncState } from "@/lib/bank/current-sync";
import { staleAfterHours } from "@/lib/bank/sync-status";
import { homeHeadline, trendSentence } from "@/lib/home";
import { formatRupiah, formatRupiahShort } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { CallTheseCustomers, RemindersToSend, TodayActivity } from "./today";

export const metadata = { title: "Home · Cashflow" };

const HEALTH: Record<string, [string, Tone]> = {
  healthy: ["Business looks healthy", "in"],
  warning: ["Something needs watching", "attention"],
  danger: ["Something needs attention", "problem"],
};
const RANK: Record<string, number> = { healthy: 0, warning: 1, danger: 2 };

const monthName = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/** Money in vs out, last 6 months. Plain bars; the numbers are also in a table for screen readers. */
function InOutChart({ months }: { months: { month: string; came_in: bigint; went_out: bigint }[] }) {
  const max = months.reduce((m, x) => (x.came_in > m ? x.came_in : x.went_out > m ? x.went_out : m), 1n);
  const pct = (v: bigint) => `${Number((v * 100n) / max)}%`;
  return (
    <>
      <div className="flex h-40 items-end gap-3" aria-hidden>
        {months.map((m) => (
          <div key={m.month} className="flex h-full flex-1 flex-col justify-end gap-1">
            <div className="flex flex-1 items-end justify-center gap-1">
              <div
                className="w-1/3 rounded-t bg-in transition-[height] duration-200 ease-out"
                style={{ height: pct(m.came_in) }}
                title={`Came in ${formatRupiah(m.came_in)}`}
              />
              <div
                className="w-1/3 rounded-t bg-muted/40 transition-[height] duration-200 ease-out"
                style={{ height: pct(m.went_out) }}
                title={`Went out ${formatRupiah(m.went_out)}`}
              />
            </div>
            <p className="text-center text-xs text-muted">{monthName.format(new Date(m.month))}</p>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Money in and out per month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Came in</th>
            <th>Went out</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{monthName.format(new Date(m.month))}</td>
              <td>{formatRupiah(m.came_in)}</td>
              <td>{formatRupiah(m.went_out)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [sync, summary, monthly, health, mismatches, me] = await Promise.all([
    currentSyncState(),
    supabase.rpc("money_summary").single(),
    supabase.rpc("monthly_in_out"),
    supabase.from("health_snapshots").select("taken_on, status").order("taken_on", { ascending: false }).limit(5),
    supabase
      .from("balance_checks")
      .select("id, difference::text, likely_cause, bank_accounts (bank_name, account_last4)")
      .eq("checked_on", today)
      .eq("status", "mismatch"),
    supabase.from("users").select("role").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  const s = summary.data;
  const big = (v: unknown) => BigInt(String(v ?? "0"));
  const cash = big(s?.cash_in_bank);
  const recurring = big(s?.recurring_spending);
  const runway = recurring > 0n ? Number((cash * 10n) / recurring) / 10 : null;

  // overall health = the worst signal of the latest snapshot
  const latest = health.data?.filter((h) => h.taken_on === health.data?.[0]?.taken_on) ?? [];
  const worst = latest.reduce<string | null>(
    (w, h) => (w === null || RANK[h.status] > RANK[w] ? h.status : w),
    null,
  );

  const months = (monthly.data ?? []).map((m) => ({
    month: m.month,
    came_in: big(m.came_in),
    went_out: big(m.went_out),
  }));
  const pastDue = big(s?.past_due);

  return (
    <div className="flex flex-col gap-6">
      {me.data?.role === "owner" &&
        mismatches.data?.map((m) => (
          <Card key={m.id} className="flex flex-col gap-1 border-problem/40 bg-problem/10">
            <p className="font-medium text-problem">
              {m.bank_accounts?.bank_name} ••{m.bank_accounts?.account_last4} doesn&apos;t add up: the
              bank shows {formatRupiah(big(m.difference) < 0n ? -big(m.difference) : big(m.difference))}{" "}
              {big(m.difference) < 0n ? "less" : "more"} than our records.
            </p>
            <p className="text-sm text-problem/80">{m.likely_cause}</p>
          </Card>
        ))}

      {sync.stale ? (
        <Card className="flex flex-col gap-1 border-attention/40 bg-attention-bg/40">
          <p className="font-medium text-attention-ink">{sync.message}</p>
          <p className="text-sm text-attention-ink/80">
            Money that came in during the last {staleAfterHours()} hours may be missing.{" "}
            <Link href="/settings/bank" className="underline underline-offset-4">
              Check bank connections
            </Link>
          </p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl md:text-4xl">Home</h1>
        <p className="text-lg">{homeHeadline(cash, runway, s?.accounts_without_balance ?? 0)}</p>
        <div className="flex flex-wrap items-center gap-4">
          {worst ? (
            <Link href="/health">
              <StatusPill tone={HEALTH[worst][1]}>{HEALTH[worst][0]}</StatusPill>
            </Link>
          ) : null}
          {canAccess(me.data?.role, "/forecast") ? (
            <Link href="/forecast" className="text-sm underline underline-offset-4">
              See the next 90 days
            </Link>
          ) : null}
        </div>
      </div>

      <section aria-label="This month" className="grid gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <p className="text-sm text-muted">Came in this month</p>
          <p className="font-display text-2xl tabular-nums text-in">{formatRupiah(big(s?.came_in))}</p>
          <p className="text-sm text-muted">usual month {formatRupiahShort(big(s?.usual_came_in))}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="text-sm text-muted">Went out this month</p>
          <p className="font-display text-2xl tabular-nums">{formatRupiah(big(s?.went_out))}</p>
          <p className="text-sm text-muted">usual month {formatRupiahShort(big(s?.usual_went_out))}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="text-sm text-muted">Still owed to you</p>
          <p className="font-display text-2xl tabular-nums">{formatRupiah(big(s?.still_owed))}</p>
          {pastDue > 0n ? (
            <Link href="/customers?show=late" className="text-sm text-problem underline underline-offset-4">
              {formatRupiahShort(pastDue)} is past due
            </Link>
          ) : (
            <p className="text-sm text-muted">nothing past due</p>
          )}
        </Card>
      </section>

      {months.length ? (
        <section aria-label="Money in and out" className="flex flex-col gap-3">
          <h2 className="font-display text-xl">Money in and out</h2>
          <Card className="flex flex-col gap-4">
            <InOutChart months={months} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>{trendSentence(months)}</p>
              <p className="flex gap-4 text-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-in" /> Came in
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-muted/40" /> Went out
                </span>
              </p>
            </div>
          </Card>
        </section>
      ) : null}

      <RemindersToSend />
      <CallTheseCustomers />
      <TodayActivity today={today} />
    </div>
  );
}
