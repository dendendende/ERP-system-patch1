import Link from "next/link";
import { Card, EmptyState, FilterTabs, StatusPill } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { SendReminderNow } from "../[id]/reminder-controls";

export const metadata = { title: "Renewals · Cashflow" };

const TABS = [
  ["30", "Next 30 days"],
  ["60", "Next 60 days"],
] as const;

const FLAGS = [
  ["paid_late_last_cycle", "Paid late last time"],
  ["reminders_waiting", "Reminders not sent yet"],
  ["partial_payments", "Pays in parts"],
  ["recently_paused", "Recently paused"],
] as const;

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function RenewalsPage({ searchParams }: PageProps<"/customers/renewals">) {
  const params = await searchParams;
  const within = params.within === "60" ? "60" : "30";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: rows, error }, { data: me }] = await Promise.all([
    supabase
      .from("renewal_pipeline")
      .select(
        "subscription_id, customer_id, customer_name, plan_name, price::text, renews_on, days_until, paid_late_last_cycle, reminders_waiting, partial_payments, recently_paused, open_invoice_id",
      )
      .lte("days_until", Number(within))
      .order("renews_on"),
    supabase
      .from("users")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);
  const canAct = me?.role === "owner" || me?.role === "operator";
  // risky ones first, then soonest
  const sorted = [...(rows ?? [])].sort(
    (a, b) =>
      FLAGS.filter(([f]) => b[f]).length - FLAGS.filter(([f]) => a[f]).length ||
      (a.renews_on ?? "").localeCompare(b.renews_on ?? ""),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/customers" className="text-sm text-muted underline underline-offset-4">
          ← Customers &amp; billing
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Renewals coming up</h1>
        <p className="text-muted">
          Subscriptions about to renew, the ones that look at risk first.
        </p>
      </div>

      <FilterTabs
        value={within}
        options={TABS}
        label="Renewing within"
        href={(days) => `/customers/renewals?within=${days}`}
      />

      {error ? (
        <p className="text-sm text-problem">Couldn&apos;t load renewals. Try again.</p>
      ) : sorted.length ? (
        <section aria-label="Renewals" className="flex flex-col gap-3">
          {sorted.map((r) => {
            const flags = FLAGS.filter(([f]) => r[f]);
            return (
              <Card key={r.subscription_id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <Link
                      href={`/customers/${r.customer_id}`}
                      className="font-medium hover:underline underline-offset-4"
                    >
                      {r.customer_name}
                    </Link>
                    <p className="text-sm text-muted">
                      {r.plan_name} · renews {day.format(new Date(`${r.renews_on}T00:00:00Z`))}
                      {r.days_until === 0 ? " (today)" : ` (in ${r.days_until} days)`}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {formatRupiah(BigInt(r.price ?? "0"))}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {flags.length ? (
                    flags.map(([f, text]) => (
                      <StatusPill key={f} tone="attention">
                        {text}
                      </StatusPill>
                    ))
                  ) : (
                    <StatusPill tone="in">No warning signs</StatusPill>
                  )}
                </div>
                {canAct && r.open_invoice_id && r.customer_id ? (
                  <SendReminderNow invoiceId={r.open_invoice_id} customerId={r.customer_id} />
                ) : null}
              </Card>
            );
          })}
        </section>
      ) : (
        <EmptyState title="Nothing renewing">
          No subscription renews in the next {within} days.
        </EmptyState>
      )}
    </div>
  );
}
