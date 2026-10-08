import Link from "next/link";
import { InOutBars, ShareBars } from "@/components/charts";
import { FilterBar, FilterField, filterInput } from "@/components/filter-bar";
import { Card, EmptyState, Money } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import {
  PAGE_SIZE,
  SORT_COLUMN,
  STATUS_WORDS,
  activeChips,
  moneyHref,
  moneyListArgs,
  monthRange,
  readMoneyFilters,
  viewQuery,
} from "@/lib/money-filters";
import { redirect } from "next/navigation";
import { SavedViews } from "@/components/saved-views";
import { createClient } from "@/lib/supabase/server";
import { AddMoneyButton, ImportReminder } from "./import-prompt";
import { NeedsLabelInbox } from "./inbox";
import { TransactionsTable } from "./transactions-table";

export const metadata = { title: "Money in & out · Cashflow" };

const monthShort = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" });
const monthLong = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

type Summary = {
  count: number;
  came_in: string;
  went_out: string;
  by_month: { month: string; came_in: string; went_out: string }[];
  by_category: {
    category_id: string | null;
    category: string;
    direction: "in" | "out";
    total: string;
  }[];
};

export default async function MoneyPage({ searchParams }: PageProps<"/money">) {
  const params = await searchParams;
  const supabase = await createClient();
  // Opening the bare page (sidebar, a link elsewhere): start on my role's starting view, if the
  // owner set one. "Everything" is ?all=1, so it never bounces back here.
  const { data: role } = await supabase.rpc("current_app_role");
  // importing statements is for the owner and operators (proxy + RLS enforce it too)
  const canImport = role === "owner" || role === "operator";
  if (Object.keys(params).length === 0) {
    const { data: start } = role
      ? await supabase
          .from("saved_views")
          .select("query")
          .eq("list", "money")
          .eq("default_for_role", role)
          .maybeSingle()
      : { data: null };
    if (start?.query) redirect(`/money?${start.query}`);
  }
  const f = readMoneyFilters(params);
  const args = moneyListArgs(f);
  const [column, ascending] = SORT_COLUMN[f.sort];

  const [list, summary, categories, accounts] = await Promise.all([
    supabase
      .rpc("money_list", args)
      // amount::text keeps rupiah exact: JSON numbers lose precision above 2^53
      .select(
        "id, occurred_at, amount::text, direction, description, account, category, status, invoice_id, invoice_number, is_own_transfer, counterparty, note, by_hand",
      )
      .order(column, { ascending })
      .order("id", { ascending })
      .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1),
    supabase.rpc("money_list_summary", args),
    supabase.from("categories").select("id, name, type").order("name"),
    supabase.from("bank_accounts").select("id, bank_name, account_last4").order("bank_name"),
  ]);
  // never show totals or rows worked out from a failed read
  const failed = [list, summary, categories, accounts].find((r) => r.error);
  if (failed?.error) throw new Error(`Money in & out didn't load: ${failed.error.message}`);

  const s = summary.data as unknown as Summary;
  const rows = list.data ?? [];
  const cameIn = BigInt(s.came_in);
  const wentOut = BigInt(s.went_out);
  const total = Number(s.count);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const names = {
    categories: new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    accounts: new Map(
      (accounts.data ?? []).map((a) => [a.id, `${a.bank_name} ••${a.account_last4}`]),
    ),
  };
  const chips = activeChips(f, names, formatRupiah);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl md:text-4xl">Money in &amp; out</h1>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/money/regular-costs" className="text-sm underline underline-offset-4">
            Regular costs
          </Link>
          {canImport ? <AddMoneyButton /> : null}
        </div>
      </div>

      {canImport ? <ImportReminder /> : null}

      <NeedsLabelInbox />

      <FilterBar
        action="/money"
        chips={chips}
        clearHref="/money?all=1"
        keep={{ sort: f.sort === "date_desc" ? "" : f.sort }}
      >
        <FilterField label="Search">
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Description, who, or note"
            className={`${filterInput} w-48`}
          />
        </FilterField>
        <FilterField label="From">
          <input
            type="date"
            name="from"
            defaultValue={f.from}
            className={`${filterInput} tabular-nums`}
          />
        </FilterField>
        <FilterField label="To">
          <input
            type="date"
            name="to"
            defaultValue={f.to}
            className={`${filterInput} tabular-nums`}
          />
        </FilterField>
        <FilterField label="In or out">
          <select name="dir" defaultValue={f.dir} className={filterInput}>
            <option value="">Both</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </select>
        </FilterField>
        <FilterField label="Category">
          <select name="category" defaultValue={f.category} className={`${filterInput} max-w-48`}>
            <option value="">Any</option>
            {(["in", "out"] as const).map((type) => (
              <optgroup key={type} label={type === "in" ? "Money in" : "Money out"}>
                {(categories.data ?? [])
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={f.status} className={filterInput}>
            <option value="">Any</option>
            {Object.entries(STATUS_WORDS).map(([value, words]) => (
              <option key={value} value={value}>
                {words}
              </option>
            ))}
          </select>
        </FilterField>
        {(accounts.data ?? []).length > 1 ? (
          <FilterField label="Account">
            <select name="account" defaultValue={f.account} className={filterInput}>
              <option value="">All accounts</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {names.accounts.get(a.id)}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="At least (Rp)">
          <input
            name="min"
            inputMode="numeric"
            defaultValue={f.min ? Number(f.min).toLocaleString("id-ID") : ""}
            className={`${filterInput} w-32 tabular-nums`}
          />
        </FilterField>
        <FilterField label="At most (Rp)">
          <input
            name="max"
            inputMode="numeric"
            defaultValue={f.max ? Number(f.max).toLocaleString("id-ID") : ""}
            className={`${filterInput} w-32 tabular-nums`}
          />
        </FilterField>
      </FilterBar>
      <SavedViews list="money" base="/money" query={viewQuery(f)} />

      {total === 0 ? (
        <EmptyState title="Nothing to show">
          {chips.length
            ? "No transactions match these filters. Remove one of them, or clear them all."
            : "Once the bank is connected or a statement is imported, every transfer shows up here."}
        </EmptyState>
      ) : (
        <>
          {/* the numbers behind what's listed below — each one narrows the list to itself */}
          <section
            aria-label="Totals"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0"
          >
            <Card className="flex flex-col gap-0.5 p-4">
              <span className="text-xs text-muted">Transactions</span>
              <span className="text-lg tabular-nums lg:text-xl">
                {total.toLocaleString("id-ID")}
              </span>
            </Card>
            <Link
              href={moneyHref(f, { dir: "in" })}
              className="rounded-xl transition-colors hover:bg-ground"
            >
              <Card className="flex h-full flex-col gap-0.5 p-4">
                <span className="text-xs text-muted">Came in</span>
                <Money amount={cameIn} direction="in" className="text-lg lg:text-xl" />
              </Card>
            </Link>
            <Link
              href={moneyHref(f, { dir: "out" })}
              className="rounded-xl transition-colors hover:bg-ground"
            >
              <Card className="flex h-full flex-col gap-0.5 p-4">
                <span className="text-xs text-muted">Went out</span>
                <Money amount={wentOut} direction="out" className="text-lg lg:text-xl" />
              </Card>
            </Link>
            <Card className="flex flex-col gap-0.5 p-4">
              <span className="text-xs text-muted">Difference</span>
              <Money
                amount={cameIn - wentOut}
                direction={cameIn >= wentOut ? "in" : "out"}
                className="text-lg lg:text-xl"
              />
            </Card>
          </section>
          <p className="-mt-2 text-xs text-muted">
            Money moved between your own accounts, and hand entries cancelled as mistakes, are
            listed but left out of these totals.
          </p>

          <section aria-label="Charts" className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <InOutBars
                label="In and out by month"
                periods={s.by_month.map((m) => ({
                  label: monthShort.format(new Date(`${m.month}T00:00:00Z`)),
                  longLabel: monthLong.format(new Date(`${m.month}T00:00:00Z`)),
                  cameIn: BigInt(m.came_in),
                  wentOut: BigInt(m.went_out),
                  href: moneyHref(f, monthRange(m.month)),
                }))}
              />
            </Card>
            <Card className="p-4">
              <ShareBars
                label="Biggest categories"
                items={s.by_category.map((c) => ({
                  label: c.category,
                  value: BigInt(c.total),
                  tone: c.direction,
                  href: c.category_id
                    ? moneyHref(f, { category: c.category_id })
                    : moneyHref(f, { status: "needs_label" }),
                }))}
              />
            </Card>
          </section>

          <section aria-label="Transactions" className="flex flex-col gap-2">
            <TransactionsTable
              rows={rows}
              filters={f}
              total={total}
              net={(cameIn - wentOut).toString()}
              toolbar={
                <p className="tabular-nums">
                  {total.toLocaleString("id-ID")} {total === 1 ? "transaction" : "transactions"}
                  {lastPage > 1 ? ` · page ${f.page} of ${lastPage}` : ""}
                </p>
              }
            />
            {lastPage > 1 ? (
              <nav className="flex items-center justify-between text-sm" aria-label="Pages">
                {f.page > 1 ? (
                  <Link
                    href={moneyHref(f, { page: f.page - 1 })}
                    className="underline underline-offset-4"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                {f.page < lastPage ? (
                  <Link
                    href={moneyHref(f, { page: f.page + 1 })}
                    className="underline underline-offset-4"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
