import Link from "next/link";
import { Card, EmptyState, StatusPill } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { CostForm, Suggestion } from "./cost-forms";

export const metadata = { title: "Regular costs · Cashflow" };

const HOW_OFTEN: Record<string, string> = {
  monthly: "every month",
  quarterly: "every 3 months",
  yearly: "every year",
};

/** First day of the month `months` before the month of `day` (YYYY-MM-DD in, out). */
function monthsBefore(day: string, months: number) {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export default async function RegularCostsPage() {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: costs }, { data: suggestions }, { data: me }] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("id, name, expected_amount::text, frequency, day_of_month, start_date, end_date, is_active")
      .order("is_active", { ascending: false })
      .order("expected_amount", { ascending: false }),
    supabase.rpc("suggest_recurring_expenses"),
    supabase.from("users").select("role").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  const isOwner = me?.role === "owner";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/money" className="text-sm text-muted underline underline-offset-4">
          ← Money in &amp; out
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Regular costs</h1>
        <p className="text-muted">
          What you pay again and again — rent, salaries, hosting. The cash forecast takes them off on
          the day they&apos;re usually paid.
        </p>
      </div>

      {suggestions?.length ? (
        <section aria-label="Suggestions" className="flex flex-col gap-3">
          <h2 className="font-display text-xl">These look regular</h2>
          <p className="text-sm text-muted">
            Found in your bank history. Nothing is added until {isOwner ? "you say so" : "the owner says so"}.
          </p>
          {suggestions.map((s) => (
            <Card key={s.pattern} className="flex flex-col gap-3">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted">
                  about <span className="tabular-nums">{formatRupiah(BigInt(s.expected_amount))}</span> around
                  day {s.day_of_month}, {s.months_seen} months in a row
                </p>
              </div>
              {isOwner ? (
                <Suggestion
                  pattern={s.pattern}
                  name={s.name}
                  amount={String(s.expected_amount)}
                  day={s.day_of_month}
                  categoryId={s.category_id}
                  since={monthsBefore(s.last_seen, s.months_seen - 1)}
                />
              ) : null}
            </Card>
          ))}
        </section>
      ) : null}

      <section aria-label="Regular costs" className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Your regular costs</h2>
        {costs?.length ? (
          costs.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted">
                    <span className="tabular-nums">{formatRupiah(BigInt(c.expected_amount))}</span>{" "}
                    {HOW_OFTEN[c.frequency]}, around day {c.day_of_month}
                  </p>
                </div>
                <StatusPill tone={c.is_active ? "in" : "neutral"}>{c.is_active ? "Paying" : "Stopped"}</StatusPill>
              </div>
              {isOwner ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted underline underline-offset-4">Change</summary>
                  <div className="mt-3">
                    <CostForm cost={c} today={today} idKey={c.id} />
                  </div>
                </details>
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState title="None yet">
            Add the costs you pay every month, quarter or year so the forecast can plan for them.
          </EmptyState>
        )}
      </section>

      {isOwner ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-xl">Add a regular cost</h2>
          <CostForm today={today} idKey="new" />
        </Card>
      ) : null}
    </div>
  );
}
