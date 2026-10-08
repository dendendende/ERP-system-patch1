import Link from "next/link";
import { Suspense } from "react";
import { Cue, CueGrid, CueSkeleton } from "@/components/cue";
import { Card } from "@/components/ui";
import { canAccess } from "@/lib/auth/routes";
import { currentSyncState } from "@/lib/bank/current-sync";
import { staleAfterHours } from "@/lib/bank/sync-status";
import { type HealthStatus, worstStatus } from "@/lib/health-status";
import { homeHeadline, trendSentence } from "@/lib/home";
import { formatRupiah, formatRupiahShort } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { NewDevices } from "./new-devices";
import { SetupCard } from "./setup-card";
import { CallTheseCustomers, RemindersToSend, TodayActivity } from "./today";

export const metadata = { title: "Home · Cashflow" };

const HEALTH_WORDS: Record<HealthStatus, string> = {
  healthy: "Business looks healthy",
  warning: "Something needs watching",
  danger: "Something needs attention",
};

// dots that read on the dark banner
const HEALTH_DOT: Record<HealthStatus, string> = {
  healthy: "bg-emerald-400",
  warning: "bg-amber-300",
  danger: "bg-red-400",
};

const monthName = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/** Money in vs out, last 6 months. Plain bars; the numbers are also in a table for screen readers. */
function InOutChart({
  months,
}: {
  months: { month: string; came_in: bigint; went_out: bigint }[];
}) {
  const max = months.reduce(
    (m, x) => (x.came_in > m ? x.came_in : x.went_out > m ? x.went_out : m),
    1n,
  );
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

/** Counts load on their own: a slow one never holds up the page. */
async function NeedsLabelCue() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_label");
  return (
    <Cue
      label="Need a label"
      value={count ?? 0}
      unit={count === 1 ? "transaction" : "transactions"}
      href="/money?status=needs_label"
    />
  );
}

async function LateCustomersCue() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("customer_billing")
    .select("id", { count: "exact", head: true })
    .eq("is_late", true);
  return (
    <Cue
      label="Paying late"
      value={count ?? 0}
      unit={count === 1 ? "customer" : "customers"}
      href="/customers?show=late"
    />
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
    supabase
      .from("health_snapshots")
      .select("taken_on, signal, status")
      .order("taken_on", { ascending: false })
      .limit(5),
    supabase
      .from("balance_checks")
      .select("id, difference::text, likely_cause, bank_accounts (bank_name, account_last4)")
      .eq("checked_on", today)
      .eq("status", "mismatch"),
    supabase
      .from("users")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);

  // Never show money worked out from a failed read: Rp 0 would look like an empty bank.
  const failed = [summary, monthly, health, mismatches].find((r) => r.error);
  if (failed?.error) throw new Error(`Home didn't load: ${failed.error.message}`);

  const s = summary.data;
  const big = (v: unknown) => BigInt(String(v ?? "0"));
  const cash = big(s?.cash_in_bank);
  const recurring = big(s?.recurring_spending);
  const runway = recurring > 0n ? Number((cash * 10n) / recurring) / 10 : null;

  // overall health = the worst signal of the latest snapshot
  const latest = health.data?.filter((h) => h.taken_on === health.data?.[0]?.taken_on) ?? [];
  const worst = worstStatus(latest.map((h) => h.status));

  const months = (monthly.data ?? []).map((m) => ({
    month: m.month,
    came_in: big(m.came_in),
    went_out: big(m.went_out),
  }));
  const pastDue = big(s?.past_due);
  const monthStart = `${today.slice(0, 8)}01`;
  // the colour of what is owed comes from the owner's limit for bills 30+ days late
  const late = latest.find((h) => h.signal === "late_share");
  const lateStatus = late ? (late.status as HealthStatus) : null;
  const todayWords = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  });

  return (
    <div className="flex flex-col gap-6">
      {me.data?.role === "owner" &&
        mismatches.data?.map((m) => (
          <Card key={m.id} className="flex flex-col gap-1 border-problem/40 bg-problem/10">
            <p className="font-medium text-problem">
              {m.bank_accounts?.bank_name} ••{m.bank_accounts?.account_last4} doesn&apos;t add up:
              the bank shows{" "}
              {formatRupiah(big(m.difference) < 0n ? -big(m.difference) : big(m.difference))}{" "}
              {big(m.difference) < 0n ? "less" : "more"} than our records.
            </p>
            <p className="text-sm text-problem">{m.likely_cause}</p>
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

      {me.data?.role === "owner" ? <SetupCard /> : null}
      {me.data?.role === "owner" ? <NewDevices /> : null}

      {/* the headline, on the one dark-blue banner in the app */}
      <section className="relative isolate overflow-hidden rounded-2xl bg-brand-deep p-6 text-white shadow-lg md:p-8">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_75%)]"
        />
        <div
          aria-hidden
          className="absolute -top-28 -right-20 -z-10 size-80 rounded-full bg-brand opacity-70 blur-3xl"
        />
        <div className="flex flex-col gap-3">
          <p className="text-sm text-white/70">{todayWords}</p>
          <h1 className="font-display text-3xl md:text-4xl">Home</h1>
          <p className="max-w-2xl text-lg text-white/90">
            {homeHeadline(cash, runway, s?.accounts_without_balance ?? 0)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {worst ? (
              <Link
                href="/health"
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm ring-1 ring-white/25 transition-colors hover:bg-white/20"
              >
                <span aria-hidden className={`size-2 rounded-full ${HEALTH_DOT[worst]}`} />
                {HEALTH_WORDS[worst]}
              </Link>
            ) : null}
            {canAccess(me.data?.role, "/forecast") ? (
              <Link
                href="/forecast"
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-medium text-brand-deep transition-colors hover:bg-brand-soft"
              >
                See the next 90 days →
              </Link>
            ) : null}
          </div>
          {/* the quickest way to add money: big, and in the colours of in and out */}
          {me.data?.role === "owner" || me.data?.role === "operator" ? (
            <nav aria-label="Add money" className="mt-3 grid gap-3 sm:max-w-xl sm:grid-cols-2">
              {(
                [
                  ["in", "+", "Money in", "Record what came in", "bg-in"],
                  ["out", "−", "Money out", "Record what went out", "bg-problem"],
                ] as const
              ).map(([dir, sign, text, hint, colour]) => (
                <Link
                  key={dir}
                  href={`/money/new?dir=${dir}`}
                  className={`${colour} flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
                >
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20 text-2xl leading-none"
                  >
                    {sign}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-lg font-semibold">{text}</span>
                    <span className="text-sm">{hint}</span>
                  </span>
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </section>

      {/* every number opens the list behind it */}
      <CueGrid label="This month">
        <Cue
          wide
          label="Came in this month"
          value={big(s?.came_in)}
          unit="rupiah"
          href={`/money?dir=in&from=${monthStart}&to=${today}`}
          caption={`usual month ${formatRupiahShort(big(s?.usual_came_in))}`}
          spark={months.map((m) => Number(m.came_in))}
        />
        <Cue
          wide
          label="Went out this month"
          value={big(s?.went_out)}
          unit="rupiah"
          href={`/money?dir=out&from=${monthStart}&to=${today}`}
          caption={`usual month ${formatRupiahShort(big(s?.usual_went_out))}`}
          spark={months.map((m) => Number(m.went_out))}
        />
        <Cue
          wide
          label="Still owed to you"
          value={big(s?.still_owed)}
          unit="rupiah"
          href={pastDue > 0n ? "/customers?show=late" : "/customers"}
          status={lateStatus}
          caption={pastDue > 0n ? `${formatRupiahShort(pastDue)} is past due` : "nothing past due"}
        />
        <Suspense fallback={<CueSkeleton />}>
          <NeedsLabelCue />
        </Suspense>
        <Suspense fallback={<CueSkeleton />}>
          <LateCustomersCue />
        </Suspense>
      </CueGrid>

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
