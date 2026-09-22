import Link from "next/link";
import { Button, Card, EmptyState, FilterTabs, StatusPill, TableRow } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Customers & billing · Cashflow" };

const TABS = [
  ["all", "All"],
  ["late", "Late"],
  ["renewing", "Renewing soon"],
  ["active", "Active"],
  ["ended", "Ended"],
] as const;

type Filter = (typeof TABS)[number][0];

const jakartaDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
});

/** A date column is a plain YYYY-MM-DD: read it as that day, not as a moment in time. */
const day = (date: string) => jakartaDate.format(new Date(`${date}T12:00:00+07:00`));

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const show = (TABS.map(([value]) => value) as string[]).includes(one(params.show))
    ? (one(params.show) as Filter)
    : "all";
  const q = one(params.q).trim();

  const supabase = await createClient();
  let query = supabase
    .from("customer_billing")
    // still_owed::text keeps rupiah exact: JSON numbers lose precision above 2^53
    .select("id, name, still_owed::text, next_due, renews_on, is_late, is_renewing_soon, is_ongoing")
    .order("is_late", { ascending: false })
    .order("next_due", { ascending: true, nullsFirst: false })
    .order("name");

  if (show === "late") query = query.eq("is_late", true);
  if (show === "renewing") query = query.eq("is_renewing_soon", true);
  if (show === "active") query = query.eq("is_ongoing", true);
  if (show === "ended") query = query.eq("is_ongoing", false);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data: rows, error } = await query;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl md:text-4xl">Customers &amp; billing</h1>

      <form method="get" action="/customers" className="flex flex-col gap-3">
        <FilterTabs name="show" value={show} options={TABS} label="Show" />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Search
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Customer name"
              className="h-10 w-56 rounded-lg border border-line bg-surface px-3 text-sm"
            />
          </label>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </div>
      </form>

      {error ? (
        <p className="text-sm text-problem">Couldn&apos;t load customers. Try again.</p>
      ) : rows?.length ? (
        <section aria-label="Customers">
          <Card className="p-0">
            {rows.map((c) => {
              const owed = BigInt(c.still_owed ?? "0");
              return (
                <TableRow
                  key={c.id}
                  primary={
                    <Link href={`/customers/${c.id}`} className="hover:underline underline-offset-4">
                      {c.name}
                    </Link>
                  }
                  secondary={
                    c.next_due
                      ? `Still owed · due ${day(c.next_due)}`
                      : c.is_ongoing && c.renews_on
                        ? `Renews ${day(c.renews_on)}`
                        : "No renewal planned"
                  }
                  meta={
                    c.is_late ? (
                      <StatusPill tone="problem">Late</StatusPill>
                    ) : c.is_renewing_soon ? (
                      <StatusPill tone="attention">Renewing soon</StatusPill>
                    ) : c.is_ongoing ? (
                      <StatusPill tone="in">Active</StatusPill>
                    ) : (
                      <StatusPill>Ended</StatusPill>
                    )
                  }
                  amount={owed > 0n ? formatRupiah(owed) : <span className="text-muted">—</span>}
                />
              );
            })}
          </Card>
        </section>
      ) : (
        <EmptyState title="Nothing to show">
          {q || show !== "all"
            ? "No customers match what you asked for. Try clearing the search."
            : "Customers you bill will show up here, with what they still owe."}
        </EmptyState>
      )}
    </div>
  );
}
