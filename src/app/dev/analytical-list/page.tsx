import { notFound } from "next/navigation";
import { AnalyticalListPage, panelHref } from "@/components/analytical-list-page";
import { InOutBars, ShareBars } from "@/components/charts";
import { FilterBar, FilterField, filterInput } from "@/components/filter-bar";
import { ObjectPage } from "@/components/object-page";
import { Card, Money, StatusPill } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { type DemoRow, DemoTable } from "./demo-table";

export const metadata = { title: "List page · Cashflow" };

const PAYEES = ["PT Maju Jaya", "CV Sinar Abadi", "Toko Sumber Rezeki", "PLN", "Telkom", "Gojek"];
const CATEGORIES = ["Subscriptions", "Salaries", "Rent", "Internet", "Transport"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

/** The same 300 made-up transactions every time, January–June 2026. */
const ROWS: DemoRow[] = (() => {
  let seed = 11;
  const next = () => (seed = (seed * 48271) % 2147483647);
  return Array.from({ length: 300 }, (_, i) => ({
    id: `t${i + 1}`,
    day: new Date(Date.UTC(2026, 0, 1) + Math.floor(i * 0.6) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    payee: `${PAYEES[next() % PAYEES.length]} #${i + 1}`,
    category: CATEGORIES[next() % CATEGORIES.length],
    direction: next() % 3 === 0 ? "in" : "out",
    amount: String(100_000 + (next() % 20_000_000)),
  }));
})();

/** The floorplan with made-up data: what each list page will look like (e2e/list-page.spec.ts). */
export default async function ListPageDemo({ searchParams }: PageProps<"/dev/analytical-list">) {
  // development page; not part of the live app
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const dir = one("dir");
  const category = one("category");
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams(
      Object.entries({ dir, category, ...extra }).filter(([, v]) => v),
    ).toString();
    return `/dev/analytical-list${q ? `?${q}` : ""}`;
  };
  const listHref = href({});

  const rows = ROWS.filter(
    (r) => (!dir || r.direction === dir) && (!category || r.category === category),
  );
  const sum = (d: string, list = rows) =>
    list.filter((r) => r.direction === d).reduce((t, r) => t + BigInt(r.amount), 0n);
  const open = ROWS.find((r) => r.id === one("open")) ?? null;
  const chips = [
    ...(dir ? [{ label: dir === "in" ? "Money in" : "Money out", href: href({ dir: "" }) }] : []),
    ...(category ? [{ label: category, href: href({ category: "" }) }] : []),
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col px-4 py-10 has-[[data-panel-open]]:xl:max-w-7xl">
      <AnalyticalListPage
        title="List page"
        tableLabel="Transactions"
        filters={
          <FilterBar action="/dev/analytical-list" chips={chips} clearHref="/dev/analytical-list">
            <FilterField label="In or out">
              <select name="dir" defaultValue={dir} className={filterInput}>
                <option value="">Both</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </select>
            </FilterField>
            <FilterField label="Category">
              <select name="category" defaultValue={category} className={filterInput}>
                <option value="">Any</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </FilterField>
          </FilterBar>
        }
        totals={
          <section aria-label="Totals" className="grid grid-cols-2 gap-3">
            <Card className="flex flex-col gap-0.5 p-4">
              <span className="text-xs text-muted">Came in</span>
              <Money amount={sum("in")} direction="in" className="text-lg" />
            </Card>
            <Card className="flex flex-col gap-0.5 p-4">
              <span className="text-xs text-muted">Went out</span>
              <Money amount={sum("out")} direction="out" className="text-lg" />
            </Card>
          </section>
        }
        charts={[
          <InOutBars
            key="months"
            label="In and out by month"
            periods={MONTHS.map((m, i) => {
              const month = rows.filter((r) => Number(r.day.slice(5, 7)) === i + 1);
              return {
                label: m,
                longLabel: `${m} 2026`,
                cameIn: sum("in", month),
                wentOut: sum("out", month),
                href: listHref,
              };
            })}
          />,
          <ShareBars
            key="categories"
            label="Categories"
            items={CATEGORIES.map((c) => ({
              label: c,
              value: sum(
                "out",
                rows.filter((r) => r.category === c),
              ),
              tone: "out" as const,
              href: href({ category: c }),
            }))}
          />,
        ]}
        table={<DemoTable rows={rows} listHref={listHref} openId={open?.id} />}
        panel={
          open
            ? {
                title: open.payee,
                closeHref: panelHref(listHref, null),
                content: (
                  <ObjectPage
                    mode="panel"
                    title={open.payee}
                    eyebrow={open.day}
                    headline={
                      <Money
                        amount={BigInt(open.amount)}
                        direction={open.direction}
                        className="font-display text-3xl"
                      />
                    }
                    status={<StatusPill>{open.category}</StatusPill>}
                    facts={[
                      {
                        label: "In or out",
                        value: open.direction === "in" ? "Money in" : "Money out",
                      },
                      { label: "Category", value: open.category },
                      { label: "Amount", value: formatRupiah(BigInt(open.amount)) },
                      { label: "Date", value: open.day },
                    ]}
                    sections={[
                      {
                        id: "details",
                        title: "Details",
                        content: <p className="text-sm text-muted">Made up for the demo.</p>,
                      },
                      {
                        id: "history",
                        title: "Change history",
                        content: <p className="text-sm text-muted">Nothing has been changed.</p>,
                      },
                    ]}
                  />
                ),
              }
            : null
        }
      />
    </main>
  );
}
