import Link from "next/link";
import { Suspense } from "react";
import { CompareToggle, InOutBars, ShareBars } from "@/components/charts";
import { CueGrid, CueSkeleton } from "@/components/cue";
import { Card, Skeleton } from "@/components/ui";
import { type Role, canAccess } from "@/lib/auth/routes";
import { currentSyncState } from "@/lib/bank/current-sync";
import { staleAfterHours } from "@/lib/bank/sync-status";
import { type Vs, VS_WORDS, readVs, shiftBack, shiftForward } from "@/lib/compare";
import { type HealthStatus, worstStatus } from "@/lib/health-status";
import { homeHeadline, trendSentence } from "@/lib/home";
import { arrange, cueInfo } from "@/lib/home-cues";
import { formatRupiah } from "@/lib/money";
import { monthRange } from "@/lib/money-filters";
import { createClient } from "@/lib/supabase/server";
import { ArrangeCues } from "./arrange-cues";
import { HomeCue, lastSevenDays, monthly, revenue, spending, summary } from "./home-cues";
import { NewDevices } from "./new-devices";
import { SetupCard } from "./setup-card";
import { CallTheseCustomers, FailedMessages, RemindersToSend, TodayActivity } from "./today";

export const metadata = { title: "Home · Cashflow" };

// Home (P8-T6): headline → cues → charts → lists → shortcuts. Which cues, and in what order,
// depends on the role (lib/home-cues.ts).

const SHORTCUTS: [href: string, text: string][] = [
  ["/money?status=needs_label", "Label money"],
  ["/money/import", "Import a bank file"],
  ["/customers?show=late", "Customers paying late"],
  ["/customers/renewals", "Renewals"],
  ["/money/regular-costs", "Regular costs"],
  ["/forecast", "Next 90 days"],
  ["/health", "Business health"],
  ["/settings/weekly-summary", "Weekly summary"],
];

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

const monthShort = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const vsWords = (vs: Vs | null) => (vs ? VS_WORDS[vs] : undefined);

/** Who paid the most over the last 12 months: the concentration cue, as a picture. */
async function TopCustomers({ today, vs }: { today: string; vs: Vs | null }) {
  const [top, then] = await Promise.all([
    revenue(today).then((r) => r.byCustomer.slice(0, 5)),
    // comparing: the 12 months up to a month / a year before (everyone; missing = 0)
    vs
      ? (await createClient())
          .rpc("revenue_by_customer", { p_on: shiftBack(today, vs) })
          .select("customer_id, total::text")
      : null,
  ]);
  if (then?.error) throw new Error(`Couldn't compare who paid: ${then.error.message}`);
  if (!top.length) return null;
  const before = new Map(
    (then?.data ?? []).map((e) => [`/customers/${e.customer_id}`, BigInt(e.total)]),
  );
  return (
    <Card>
      <ShareBars
        label="Who paid you most, last 12 months"
        vs={vsWords(vs)}
        items={top.map((c) => ({
          label: c.name,
          value: c.total,
          tone: "in",
          href: c.href,
          before: vs ? (before.get(c.href) ?? 0n) : null,
        }))}
      />
    </Card>
  );
}

/** Where the money went this month, biggest categories first. */
async function TopCosts({ today, vs }: { today: string; vs: Vs | null }) {
  // comparing: that month up to the same day, a month / a year before (every category)
  const [now, then] = await Promise.all([
    spending(today),
    vs ? spending(shiftBack(today, vs)) : null,
  ]);
  const top = now.byCategory.filter((c) => c.thisMonth > 0n).slice(0, 5);
  if (!top.length) return null;
  const before = new Map((then?.byCategory ?? []).map((c) => [c.category, c.thisMonth]));
  return (
    <Card>
      <ShareBars
        label="Where money went this month"
        vs={vsWords(vs)}
        items={top.map((c) => ({
          label: c.category,
          value: c.thisMonth,
          tone: "out",
          href: c.href,
          before: vs ? (before.get(c.category) ?? 0n) : null,
        }))}
      />
    </Card>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const arranging = params.arrange === "1";
  const vs = readVs(params.vs);
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // the summary and months are cached for the request: the cues read the same ones
  const [sync, s, monthRows, health, mismatches, me, layout, monthsThen] = await Promise.all([
    currentSyncState(),
    summary(),
    monthly(),
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
    // this person's own arrangement of the cues (none = the role's starting set)
    supabase
      .from("home_layouts")
      .select("cues")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    // comparing: the same six months, a month / a year before (each up to the same day)
    vs ? supabase.rpc("monthly_in_out", { p_today: shiftBack(today, vs) }) : null,
  ]);

  // Never show money worked out from a failed read: Rp 0 would look like an empty bank.
  const failed = [health, mismatches, layout, monthsThen].find((r) => r?.error);
  if (failed?.error) throw new Error(`Home didn't load: ${failed.error.message}`);

  const role: Role = me.data?.role ?? "viewer";
  const big = (v: unknown) => BigInt(String(v ?? "0"));
  const cash = big(s?.cash_in_bank);
  const recurring = big(s?.recurring_spending);
  const runway = recurring > 0n ? Number((cash * 10n) / recurring) / 10 : null;

  // overall health = the worst signal of the latest snapshot
  const latest = health.data?.filter((h) => h.taken_on === health.data?.[0]?.taken_on) ?? [];
  const worst = worstStatus(latest.map((h) => h.status));

  const months = monthRows.map((m) => ({
    month: m.month,
    came_in: big(m.came_in),
    went_out: big(m.went_out),
  }));
  const monthBefore = new Map(
    (monthsThen?.data ?? []).map((m) => [
      shiftForward(m.month, vs!),
      { cameIn: big(m.came_in), wentOut: big(m.went_out) },
    ]),
  );
  const { shown, hidden } = arrange(role, layout.data?.cues ?? null);
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
      <section className="relative isolate overflow-hidden rounded-2xl bg-brand-deep p-6 text-white shadow-lg [--focus-ring:var(--color-surface)] md:p-8">
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
                  className={`${colour} flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:brightness-110`}
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

      {/* every number opens the list behind it; each loads on its own */}
      {arranging ? (
        <ArrangeCues shown={shown} hidden={hidden} />
      ) : (
        <div className="flex justify-end">
          <Link
            href="/?arrange=1"
            className="text-sm text-muted underline-offset-4 hover:text-brand hover:underline"
          >
            {shown.length ? "Arrange these numbers" : "All numbers are hidden — choose some"}
          </Link>
        </div>
      )}
      {shown.length ? (
        <CueGrid label="Your numbers">
          {shown.map((id) => (
            <Suspense key={id} fallback={<CueSkeleton wide={cueInfo(id).wide} />}>
              <HomeCue id={id} today={today} />
            </Suspense>
          ))}
        </CueGrid>
      ) : null}

      {months.length ? (
        <section aria-label="Money in and out" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl">Money in and out</h2>
            {/* one choice for every chart on Home */}
            <CompareToggle vs={vs} href={(v) => (v ? `/?vs=${v}` : "/")} />
          </div>
          <Card className="flex flex-col gap-4">
            <InOutBars
              label="Last 6 months"
              vs={vsWords(vs)}
              periods={months.map((m) => {
                const { from, to } = monthRange(m.month);
                return {
                  label: monthShort.format(new Date(`${m.month}T00:00:00Z`)),
                  longLabel: monthLong.format(new Date(`${m.month}T00:00:00Z`)),
                  cameIn: m.came_in,
                  wentOut: m.went_out,
                  href: `/money?from=${from}&to=${to}`,
                  before: vs ? (monthBefore.get(m.month) ?? { cameIn: 0n, wentOut: 0n }) : null,
                };
              })}
            />
            <p className="text-sm">{trendSentence(months)}</p>
          </Card>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <TopCustomers today={today} vs={vs} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-40" />}>
          <TopCosts today={today} vs={vs} />
        </Suspense>
      </div>

      <RemindersToSend />
      <FailedMessages since={lastSevenDays()} />
      <CallTheseCustomers />
      <TodayActivity today={today} />

      <nav aria-label="Shortcuts" className="flex flex-wrap gap-2 border-t border-line pt-4">
        {SHORTCUTS.filter(([href]) => canAccess(role, href)).map(([href, text]) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-brand/40 hover:text-brand"
          >
            {text}
          </Link>
        ))}
      </nav>
    </div>
  );
}
