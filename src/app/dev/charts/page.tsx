import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AgingBars,
  BarChart,
  Donut,
  LineChart,
  type Series,
  StackedBars,
} from "@/components/charts";
import { Card } from "@/components/ui";

export const metadata = { title: "Charts · Cashflow" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const LONG = ["January", "February", "March", "April", "May", "June"].map((m) => `${m} 2026`);
const SPEND: Series[] = [
  { name: "Salaries", tone: 1 },
  { name: "Rent", tone: 2 },
  { name: "Internet", tone: 3 },
  { name: "Transport", tone: 4 },
];
const jt = (n: number) => BigInt(Math.round(n * 1_000_000));
// made-up numbers, millions of rupiah per month
const CAME_IN = [62, 58, 71, 66, 80, 77];
const WENT_OUT = [48, 52, 50, 61, 55, 59];
const SPEND_BY_MONTH = [
  [30, 10, 2.5, 4],
  [30, 10, 2.5, 6.5],
  [31, 10, 2.5, 5],
  [34, 12, 2.5, 7],
  [34, 12, 3, 5.5],
  [35, 12, 3, 6],
];

/** Every chart with made-up data; a click on any mark narrows to it (e2e/charts.spec.ts). */
export default async function ChartsDemo({ searchParams }: PageProps<"/dev/charts">) {
  // development page; not part of the live app
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const picked = Object.entries(params).filter(([, v]) => typeof v === "string") as [
    string,
    string,
  ][];
  const to = (q: Record<string, string>) => `/dev/charts?${new URLSearchParams(q)}`;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Charts</h1>
      <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
        {picked.length ? (
          <>
            Showing only:{" "}
            {picked.map(([k, v]) => (
              <span key={k} className="rounded-full bg-brand-soft px-2 py-0.5 text-brand-deep">
                {k} = {v}
              </span>
            ))}
            <Link href="/dev/charts" className="text-brand underline">
              Show everything
            </Link>
          </>
        ) : (
          <span className="text-muted">Nothing picked. Click any bar, point or part.</span>
        )}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <BarChart
            label="In and out by month"
            series={[
              { name: "Came in", tone: "in" },
              { name: "Went out", tone: "out" },
            ]}
            points={MONTHS.map((m, i) => ({
              label: m,
              longLabel: LONG[i]!,
              values: [jt(CAME_IN[i]!), jt(WENT_OUT[i]!)],
              href: to({ month: m }),
            }))}
          />
        </Card>
        <Card className="p-4">
          <LineChart
            label="Money in the bank at month end"
            series={[{ name: "In the bank", tone: 1 }]}
            points={MONTHS.map((m, i) => ({
              label: m,
              longLabel: LONG[i]!,
              values: [
                jt(
                  120 +
                    CAME_IN.slice(0, i + 1).reduce((a, b) => a + b, 0) -
                    WENT_OUT.slice(0, i + 1).reduce((a, b) => a + b, 0),
                ),
              ],
              href: to({ month: m }),
            }))}
          />
        </Card>
        <Card className="p-4">
          <StackedBars
            label="What spending was made of"
            series={SPEND}
            points={MONTHS.map((m, i) => ({
              label: m,
              longLabel: LONG[i]!,
              values: SPEND_BY_MONTH[i]!.map(jt),
              href: to({ month: m }),
              hrefs: SPEND.map((s) => to({ month: m, category: s.name })),
            }))}
          />
        </Card>
        <Card className="p-4">
          <AgingBars
            label="Still owed, by how late"
            buckets={[
              { label: "Not due yet", value: jt(42), count: 12, href: to({ late: "not-due" }) },
              { label: "1–30 days late", value: jt(18.5), count: 5, href: to({ late: "1-30" }) },
              { label: "31–60 days late", value: jt(7), count: 2, href: to({ late: "31-60" }) },
              { label: "61–90 days late", value: jt(3.2), count: 1, href: to({ late: "61-90" }) },
              { label: "Over 90 days late", value: jt(1.1), count: 1, href: to({ late: "90+" }) },
            ]}
          />
        </Card>
        <Card className="p-4 md:col-span-2">
          <Donut
            label="Spending by category, June"
            otherHref={to({ category: "other" })}
            parts={[
              ...SPEND.map((s, j) => ({
                label: s.name,
                value: jt(SPEND_BY_MONTH[5]![j]!),
                href: to({ category: s.name }),
              })),
              { label: "Software", value: jt(4), href: to({ category: "Software" }) },
              { label: "Marketing", value: jt(2.5), href: to({ category: "Marketing" }) },
              { label: "Bank fees", value: jt(0.3), href: to({ category: "Bank fees" }) },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}
