import Link from "next/link";
import { redirect } from "next/navigation";
import { AnalyticalListPage, panelHref } from "@/components/analytical-list-page";
import { AgingBars, CompareToggle, ShareBars } from "@/components/charts";
import { FilterBar, FilterField, filterInput } from "@/components/filter-bar";
import { SavedViews } from "@/components/saved-views";
import { Card, EmptyState, Money } from "@/components/ui";
import {
  BILL_SORT_COLUMN,
  BILL_STATUS_WORDS,
  PAGE_SIZE,
  billChips,
  billHref,
  billListArgs,
  billViewQuery,
  readBillFilters,
} from "@/lib/bill-filters";
import { VS_WORDS, fromTop, shiftBack } from "@/lib/compare";
import { AGING_BUCKETS } from "@/lib/metrics";
import { isUuid } from "@/lib/money-filters";
import { createClient } from "@/lib/supabase/server";
import { billView } from "../[id]/bills/[invoiceId]/bill";
import { BillsTable } from "./bills-table";

export const metadata = { title: "Bills · Cashflow" };

// Every bill, as an analytical list page (P8-T8a): filters → totals → charts → table, every total
// and bar a filter, and a bill opens in the side panel (?open=<id>).

type Summary = {
  count: number;
  billed: string;
  paid: string;
  owed: string;
  past_due: string;
  aging: { bucket: number; owed: string; count: number }[];
  by_customer: { customer_id: string; customer: string; owed: string }[];
};

export default async function BillsPage({ searchParams }: PageProps<"/customers/bills">) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_app_role");
  // the bare page opens my role's starting view, if the owner set one ("Everything" is ?all=1)
  if (Object.keys(params).length === 0) {
    const { data: start } = role
      ? await supabase
          .from("saved_views")
          .select("query")
          .eq("list", "invoices")
          .eq("default_for_role", role)
          .maybeSingle()
      : { data: null };
    if (start?.query) redirect(`/customers/bills?${start.query}`);
  }
  const f = readBillFilters(params);
  const args = billListArgs(f);
  const [column, ascending] = BILL_SORT_COLUMN[f.sort];
  const openId = typeof params.open === "string" && isUuid(params.open) ? params.open : null;

  const vs = f.vs || null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const [list, summary, customers, opened, earlier] = await Promise.all([
    supabase
      .rpc("bill_list", args)
      // rupiah as text: exact above 2^53
      .select(
        "id, number, customer_id, customer, status, due_on, billed::text, paid::text, owed::text, days_late",
      )
      .order(column, { ascending })
      .order("number", { ascending })
      .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1),
    supabase.rpc("bill_list_summary", args),
    supabase.from("customers").select("id, name").order("name"),
    openId ? billView(openId, "panel") : null,
    // comparing: the same bills as they stood a month / a year before
    vs ? supabase.rpc("bill_list_summary", { ...args, p_on: shiftBack(today, vs) }) : null,
  ]);
  // never show totals or rows worked out from a failed read
  const failed = [list, summary, customers, earlier].find((r) => r?.error);
  if (failed?.error) throw new Error(`Bills didn't load: ${failed.error.message}`);

  const s = summary.data as unknown as Summary;
  // the earlier aging is complete (a bucket missing had 0); its customers are a top six (fromTop)
  const was = earlier?.data as unknown as Summary | undefined;
  const bucketBefore = new Map((was?.aging ?? []).map((a) => [a.bucket, BigInt(a.owed)]));
  const customerBefore = new Map(
    (was?.by_customer ?? []).map((c) => [c.customer_id, BigInt(c.owed)]),
  );
  const rows = list.data ?? [];
  const total = Number(s.count);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const customerName = (customers.data ?? []).find((c) => c.id === f.customer)?.name ?? null;
  const chips = billChips(f, customerName);
  const listHref = billHref(f, { page: f.page });
  const owed = BigInt(s.owed);
  const pastDue = BigInt(s.past_due);

  const filters = (
    <>
      <FilterBar
        action="/customers/bills"
        chips={chips}
        clearHref="/customers/bills?all=1"
        keep={{ sort: f.sort === "due_desc" ? "" : f.sort }}
      >
        <FilterField label="Search">
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Bill number or customer"
            className={`${filterInput} w-52`}
          />
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={f.status} className={filterInput}>
            <option value="">Any</option>
            {Object.entries(BILL_STATUS_WORDS).map(([value, words]) => (
              <option key={value} value={value}>
                {words}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="How late">
          <select name="bucket" defaultValue={f.bucket} className={filterInput}>
            <option value="">Any</option>
            {AGING_BUCKETS.map((words, i) => (
              <option key={i} value={i}>
                {words}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Customer">
          <select name="customer" defaultValue={f.customer} className={`${filterInput} max-w-52`}>
            <option value="">Any</option>
            {(customers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Due from">
          <input
            type="date"
            name="from"
            defaultValue={f.from}
            className={`${filterInput} tabular-nums`}
          />
        </FilterField>
        <FilterField label="Due until">
          <input
            type="date"
            name="to"
            defaultValue={f.to}
            className={`${filterInput} tabular-nums`}
          />
        </FilterField>
      </FilterBar>
      <SavedViews list="invoices" base="/customers/bills" query={billViewQuery(f)} />
    </>
  );

  // the numbers behind what's listed — each one narrows the list to itself
  const totals = (
    <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
      <Card className="flex flex-col gap-0.5 p-4">
        <span className="text-xs text-muted">Bills</span>
        <span className="text-lg tabular-nums lg:text-xl">{total.toLocaleString("id-ID")}</span>
      </Card>
      <Card className="flex flex-col gap-0.5 p-4">
        <span className="text-xs text-muted">Billed (not counting cancelled)</span>
        <Money amount={BigInt(s.billed)} className="text-lg lg:text-xl" />
      </Card>
      <Link
        href={billHref(f, { status: "waiting" })}
        className="rounded-xl transition-colors hover:bg-ground"
      >
        <Card className="flex h-full flex-col gap-0.5 p-4">
          <span className="text-xs text-muted">Still owed</span>
          <Money amount={owed} className="text-lg lg:text-xl" />
        </Card>
      </Link>
      <Link
        href={billHref(f, { status: "late" })}
        className="rounded-xl transition-colors hover:bg-ground"
      >
        <Card className="flex h-full flex-col gap-0.5 p-4">
          <span className="text-xs text-muted">Past due</span>
          <span className={`text-lg tabular-nums lg:text-xl ${pastDue > 0n ? "text-problem" : ""}`}>
            <Money amount={pastDue} />
          </span>
        </Card>
      </Link>
    </section>
  );

  const charts =
    owed > 0n
      ? [
          <AgingBars
            key="aging"
            label="Still owed, by how late"
            vs={vs ? VS_WORDS[vs] : undefined}
            buckets={s.aging.map((a) => ({
              label: AGING_BUCKETS[a.bucket],
              value: BigInt(a.owed),
              count: a.count,
              href: billHref(f, { bucket: String(a.bucket) }),
              before: vs ? (bucketBefore.get(a.bucket) ?? 0n) : null,
            }))}
          />,
          <ShareBars
            key="customers"
            label="Who owes the most"
            vs={vs ? VS_WORDS[vs] : undefined}
            items={s.by_customer.map((c) => ({
              label: c.customer,
              value: BigInt(c.owed),
              tone: "neutral" as const,
              href: billHref(f, { customer: c.customer_id }),
              before: vs ? fromTop(customerBefore, c.customer_id, 6) : null,
            }))}
          />,
        ]
      : [];

  const table = (
    <>
      <BillsTable
        rows={rows}
        filters={f}
        listHref={listHref}
        openId={opened ? openId : null}
        total={total}
        owed={s.owed}
        canAct={role === "owner" || role === "operator"}
        toolbar={
          <p className="tabular-nums">
            {total.toLocaleString("id-ID")} {total === 1 ? "bill" : "bills"}
            {lastPage > 1 ? ` · page ${f.page} of ${lastPage}` : ""}
          </p>
        }
      />
      {lastPage > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {f.page > 1 ? (
            <Link href={billHref(f, { page: f.page - 1 })} className="underline underline-offset-4">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {f.page < lastPage ? (
            <Link href={billHref(f, { page: f.page + 1 })} className="underline underline-offset-4">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );

  return (
    <AnalyticalListPage
      title="Bills"
      tableLabel="Bills"
      actions={
        <>
          <Link href="/customers" className="text-sm underline underline-offset-4">
            Customers
          </Link>
          <Link href="/customers/renewals" className="text-sm underline underline-offset-4">
            Renewals coming up
          </Link>
        </>
      }
      filters={filters}
      totals={total === 0 ? null : totals}
      charts={total === 0 ? [] : charts}
      compare={<CompareToggle vs={vs} href={(v) => billHref(f, { vs: v ?? "", page: f.page })} />}
      table={
        total === 0 ? (
          <EmptyState title="Nothing to show">
            {chips.length
              ? "No bills match these filters. Remove one of them, or clear them all."
              : "Bills show up here as soon as a subscription renews, or when someone writes one."}
          </EmptyState>
        ) : (
          table
        )
      }
      panel={
        opened
          ? { title: opened.title, closeHref: panelHref(listHref, null), content: opened.view }
          : null
      }
    />
  );
}
