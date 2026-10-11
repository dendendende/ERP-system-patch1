import Link from "next/link";
import { redirect } from "next/navigation";
import { AnalyticalListPage, panelHref } from "@/components/analytical-list-page";
import { CompareToggle, ShareBars } from "@/components/charts";
import { FilterBar, FilterField, filterInput } from "@/components/filter-bar";
import { SavedViews } from "@/components/saved-views";
import { Card, EmptyState, FilterTabs, Money } from "@/components/ui";
import {
  CUSTOMER_SHOW_WORDS,
  type CustomerFilters,
  customerHref,
  customerViewQuery,
  readCustomerFilters,
} from "@/lib/customer-filters";
import { isUuid } from "@/lib/money-filters";
import { VS_WORDS, shiftBack } from "@/lib/compare";
import { createClient } from "@/lib/supabase/server";
import { customerView } from "./[id]/customer";
import { AddCustomerForm } from "./add-customer-form";
import { CustomersTable } from "./customers-table";

export const metadata = { title: "Customers & billing · Cashflow" };

// Customers as an analytical list page (P8-T8c): filters → totals → charts → table, and a
// customer opens in the side panel (?open=<id>) so the list keeps its place.

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_app_role");
  // the bare page opens my role's starting view, if the owner set one ("Everything" is ?all=1)
  if (Object.keys(params).length === 0 && role) {
    const { data: start } = await supabase
      .from("saved_views")
      .select("query")
      .eq("list", "customers")
      .eq("default_for_role", role)
      .maybeSingle();
    if (start?.query) redirect(`/customers?${start.query}`);
  }
  const f = readCustomerFilters(params);
  const openId = typeof params.open === "string" && isUuid(params.open) ? params.open : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  let query = supabase
    .from("customer_billing")
    // still_owed::text keeps rupiah exact: JSON numbers lose precision above 2^53
    .select(
      "id, name, still_owed::text, next_due, renews_on, is_late, is_renewing_soon, is_ongoing",
    )
    .order("is_late", { ascending: false })
    .order("next_due", { ascending: true, nullsFirst: false })
    .order("name");
  if (f.show === "late") query = query.eq("is_late", true);
  if (f.show === "renewing") query = query.eq("is_renewing_soon", true);
  if (f.show === "active") query = query.eq("is_ongoing", true);
  if (f.show === "ended") query = query.eq("is_ongoing", false);
  if (f.q) query = query.ilike("name", `%${f.q}%`);

  const vs = f.vs || null;
  const then = vs ? shiftBack(today, vs) : today;
  const [list, earned, opened, owedThen, earnedThen] = await Promise.all([
    query,
    supabase
      .rpc("revenue_by_customer", { p_on: today })
      .select("customer_id, customer, total::text"),
    openId ? customerView(openId, "panel") : null,
    // comparing: what each owed, and had paid over 12 months, a month / a year before
    vs ? supabase.rpc("invoice_owed_on", { p_on: then }).select("customer_id, owed::text") : null,
    vs
      ? supabase.rpc("revenue_by_customer", { p_on: then }).select("customer_id, total::text")
      : null,
  ]);
  const failed = [list, earned, owedThen, earnedThen].find((r) => r?.error);
  if (failed?.error) throw new Error(`Customers didn't load: ${failed.error.message}`);

  // the view's columns are all nullable in the generated types; a customer always has them
  const rows = (list.data ?? []).map((c) => ({
    ...c,
    id: c.id ?? "",
    name: c.name ?? "",
    is_late: Boolean(c.is_late),
    is_renewing_soon: Boolean(c.is_renewing_soon),
    is_ongoing: Boolean(c.is_ongoing),
  }));
  const listHref = customerHref(f);
  const open = (id: string) => panelHref(listHref, id);
  const owed = (c: (typeof rows)[number]) => BigInt(c.still_owed ?? "0");
  const totalOwed = rows.reduce((t, c) => t + owed(c), 0n);
  const late = rows.filter((c) => c.is_late).length;
  const renewing = rows.filter((c) => c.is_renewing_soon).length;
  const shown = new Set(rows.map((c) => c.id));
  const chips = [
    ...(f.show
      ? [{ label: CUSTOMER_SHOW_WORDS[f.show], href: customerHref(f, { show: "" }) }]
      : []),
    ...(f.q ? [{ label: `"${f.q}"`, href: customerHref(f, { q: "" }) }] : []),
  ];

  const filters = (
    <>
      {/* one click applies a tab (and keeps the search) */}
      <FilterTabs
        value={f.show || "all"}
        options={[["all", "All"], ...Object.entries(CUSTOMER_SHOW_WORDS)] as [string, string][]}
        label="Show"
        href={(tab) =>
          customerHref(f, { show: tab === "all" ? "" : (tab as CustomerFilters["show"]) })
        }
      />
      <FilterBar
        action="/customers"
        chips={chips}
        clearHref="/customers?all=1"
        keep={{ show: f.show }}
      >
        <FilterField label="Search">
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Customer name"
            className={`${filterInput} w-56`}
          />
        </FilterField>
      </FilterBar>
      <SavedViews list="customers" base="/customers" query={customerViewQuery(f)} />
    </>
  );

  // each number narrows the list (or opens the bills behind it)
  const totals = (
    <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
      <Card className="flex flex-col gap-0.5 p-4">
        <span className="text-xs text-muted">Customers</span>
        <span className="text-lg tabular-nums lg:text-xl">
          {rows.length.toLocaleString("id-ID")}
        </span>
      </Card>
      <Link
        href="/customers/bills?status=waiting"
        className="rounded-xl transition-colors hover:bg-ground"
      >
        <Card className="flex h-full flex-col gap-0.5 p-4">
          <span className="text-xs text-muted">Still owed</span>
          <Money amount={totalOwed} className="text-lg lg:text-xl" />
        </Card>
      </Link>
      <Link
        href={customerHref(f, { show: "late" })}
        className="rounded-xl transition-colors hover:bg-ground"
      >
        <Card className="flex h-full flex-col gap-0.5 p-4">
          <span className="text-xs text-muted">Paying late</span>
          <span className={`text-lg tabular-nums lg:text-xl ${late ? "text-problem" : ""}`}>
            {late}
          </span>
        </Card>
      </Link>
      <Link
        href={customerHref(f, { show: "renewing" })}
        className="rounded-xl transition-colors hover:bg-ground"
      >
        <Card className="flex h-full flex-col gap-0.5 p-4">
          <span className="text-xs text-muted">Renewing soon</span>
          <span className="text-lg tabular-nums lg:text-xl">{renewing}</span>
        </Card>
      </Link>
    </section>
  );

  // the earlier figures per customer: complete lists, so anyone missing had 0
  const owedBefore = new Map<string, bigint>();
  for (const o of owedThen?.data ?? [])
    owedBefore.set(o.customer_id, (owedBefore.get(o.customer_id) ?? 0n) + BigInt(o.owed));
  const paidBefore = new Map((earnedThen?.data ?? []).map((e) => [e.customer_id, BigInt(e.total)]));
  const was = (m: Map<string, bigint>, id: string) => (vs ? (m.get(id) ?? 0n) : null);
  const topOwed = rows
    .filter((c) => owed(c) > 0n)
    .sort((a, b) => (owed(b) > owed(a) ? 1 : owed(b) < owed(a) ? -1 : 0))
    .slice(0, 6);
  // of the customers listed: who paid the most over the last 12 months
  const topPaid = (earned.data ?? []).filter((e) => shown.has(e.customer_id)).slice(0, 6);
  const charts = [
    ...(topOwed.length
      ? [
          <ShareBars
            key="owed"
            label="Who owes the most"
            vs={vs ? VS_WORDS[vs] : undefined}
            items={topOwed.map((c) => ({
              label: c.name,
              value: owed(c),
              tone: "neutral" as const,
              href: open(c.id),
              before: was(owedBefore, c.id),
            }))}
          />,
        ]
      : []),
    ...(topPaid.length
      ? [
          <ShareBars
            key="paid"
            label="Who paid you most, last 12 months"
            vs={vs ? VS_WORDS[vs] : undefined}
            items={topPaid.map((e) => ({
              label: e.customer,
              value: BigInt(e.total),
              tone: "in" as const,
              href: open(e.customer_id),
              before: was(paidBefore, e.customer_id),
            }))}
          />,
        ]
      : []),
  ];

  return (
    <AnalyticalListPage
      title="Customers & billing"
      tableLabel="Customers"
      actions={
        <>
          <Link href="/customers/bills" className="text-sm underline underline-offset-4">
            Bills
          </Link>
          <Link href="/customers/renewals" className="text-sm underline underline-offset-4">
            Renewals coming up
          </Link>
        </>
      }
      notices={role === "owner" || role === "operator" ? <AddCustomerForm /> : null}
      filters={filters}
      totals={rows.length ? totals : null}
      charts={rows.length ? charts : []}
      compare={<CompareToggle vs={vs} href={(v) => customerHref(f, { vs: v ?? "" })} />}
      table={
        rows.length ? (
          <CustomersTable
            rows={rows}
            listHref={listHref}
            openId={opened ? openId : null}
            canAct={role === "owner" || role === "operator"}
            toolbar={
              <p className="tabular-nums">
                {rows.length.toLocaleString("id-ID")} {rows.length === 1 ? "customer" : "customers"}
              </p>
            }
          />
        ) : (
          <EmptyState title="Nothing to show">
            {chips.length
              ? "No customers match what you asked for. Remove a filter, or clear them all."
              : "Customers you bill will show up here, with what they still owe."}
          </EmptyState>
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
