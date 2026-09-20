import Link from "next/link";
import { Card, EmptyState, StatusPill, TableRow } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { Filters, PAGE_SIZE, jakartaRange, type MoneyFilter } from "./filters";
import { NeedsLabelInbox } from "./inbox";

export const metadata = { title: "Money in & out · Cashflow" };

const jakartaDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function MoneyPage({ searchParams }: PageProps<"/money">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const show = (["all", "in", "out", "matched"] as const).includes(one(params.show) as MoneyFilter)
    ? (one(params.show) as MoneyFilter)
    : "all";
  const [from, to, q] = [one(params.from), one(params.to), one(params.q).trim()];
  const page = Math.max(1, Number(one(params.page)) || 1);

  const supabase = await createClient();
  // amount::text keeps rupiah exact: JSON numbers lose precision above 2^53.
  let query = supabase
    .from("bank_transactions")
    .select(
      `id, occurred_at, amount::text, direction, description_raw,
       bank_accounts!inner (bank_name, account_last4),
       entries!inner (status, invoice_id, categories (name))`,
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (show === "in" || show === "out") query = query.eq("direction", show);
  if (show === "matched") query = query.not("entries.invoice_id", "is", null);
  const range = jakartaRange(from, to);
  if (range.from) query = query.gte("occurred_at", range.from);
  if (range.to) query = query.lte("occurred_at", range.to);
  if (q) query = query.ilike("description_raw", `%${q}%`);

  const { data: rows, count, error } = await query;
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (n: number) => {
    const next = new URLSearchParams({
      ...(show !== "all" && { show }),
      ...(from && { from }),
      ...(to && { to }),
      ...(q && { q }),
    });
    if (n > 1) next.set("page", String(n));
    const query = next.toString();
    return `/money${query ? `?${query}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl md:text-4xl">Money in &amp; out</h1>
        <Link href="/money/import" className="text-sm underline underline-offset-4">
          Import a bank statement
        </Link>
      </div>

      <NeedsLabelInbox />

      <Filters show={show} from={from} to={to} q={q} />

      {error ? (
        <p className="text-sm text-problem">Couldn&apos;t load transactions. Try again.</p>
      ) : rows?.length ? (
        <>
          <p className="text-sm text-muted tabular-nums">
            {total.toLocaleString("id-ID")} {total === 1 ? "transaction" : "transactions"}
            {lastPage > 1 ? ` · page ${page} of ${lastPage}` : ""}
          </p>
          <section aria-label="Transactions">
            <Card className="p-0">
              {rows.map((t) => {
                const entry = t.entries;
                const isIn = t.direction === "in";
                const amount = formatRupiah(BigInt(t.amount));
                return (
                  <TableRow
                    key={t.id}
                    primary={
                      <Link href={`/money/${t.id}`} className="hover:underline underline-offset-4">
                        {t.description_raw}
                      </Link>
                    }
                    secondary={`${jakartaDate.format(new Date(t.occurred_at))} · ${t.bank_accounts.bank_name} ••${t.bank_accounts.account_last4}`}
                    meta={
                      entry?.status === "needs_label" ? (
                        <StatusPill tone="attention">Needs label</StatusPill>
                      ) : entry?.categories ? (
                        <StatusPill>{entry.categories.name}</StatusPill>
                      ) : null
                    }
                    amount={
                      <span className={isIn ? "text-in" : undefined}>
                        {isIn ? "+" : "−"}
                        {amount.replace("−", "")}
                      </span>
                    }
                  />
                );
              })}
            </Card>
          </section>
          {lastPage > 1 ? (
            <nav className="flex items-center justify-between text-sm" aria-label="Pages">
              {page > 1 ? (
                <Link href={pageLink(page - 1)} className="underline underline-offset-4">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              {page < lastPage ? (
                <Link href={pageLink(page + 1)} className="underline underline-offset-4">
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState title="Nothing to show">
          {q || from || to || show !== "all"
            ? "No transactions match what you asked for. Try a wider date range or clear the search."
            : "Once the bank is connected or a statement is imported, every transfer shows up here."}
        </EmptyState>
      )}
    </div>
  );
}
