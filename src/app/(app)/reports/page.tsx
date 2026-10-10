import Link from "next/link";
import { notFound } from "next/navigation";
import { SaveViewForm } from "@/components/save-view-form";
import { Button, Card } from "@/components/ui";
import { filterInput } from "@/components/filter-bar";
import type { Role } from "@/lib/auth/routes";
import { REPORTS, findReport } from "@/lib/report-library";
import { mayRun, readParams, reportQuery } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { deleteView } from "../saved-views-actions";
import { ReportTable } from "./report-table";

export const metadata = { title: "Reports · Cashflow" };

// Reports (P9-T1): the library of ready-made reports, and one report run with its parameters.
// Everything is in the address (?report=…&…), so a run can be linked, bookmarked or favourited.

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_app_role");
  const id = typeof params.report === "string" ? params.report : "";
  return id ? <RunReport id={id} params={params} role={role} /> : <Library role={role} />;
}

async function Library({ role }: { role: Role | null }) {
  const supabase = await createClient();
  const { data: favourites, error } = await supabase
    .from("saved_views")
    .select("id, name, query")
    .eq("list", "reports")
    .order("name");
  if (error) throw new Error(`Reports didn't load: ${error.message}`);
  const titleOf = (query: string) =>
    findReport(new URLSearchParams(query).get("report") ?? "")?.title ?? "A report";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl md:text-4xl">Reports</h1>
        <p className="text-muted">
          Ready-made reports. Choose the dates, run it, then print it or open it in a spreadsheet.
        </p>
      </div>

      <section aria-label="Your favourites" className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Your favourites</h2>
        {favourites?.length ? (
          <Card className="p-0">
            <ul>
              {favourites.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <Link
                    href={`/reports?${f.query}`}
                    className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                  >
                    {f.name}
                  </Link>
                  <span className="hidden text-sm text-muted sm:inline">{titleOf(f.query)}</span>
                  <form action={deleteView}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="list" value="reports" />
                    <button
                      type="submit"
                      aria-label={`Remove the favourite ${f.name}`}
                      className="rounded-full px-2 text-muted hover:text-ink"
                    >
                      ×
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted">
            None yet. Run a report and choose &ldquo;Add to favourites&rdquo; to keep it here, with
            its dates.
          </p>
        )}
      </section>

      <section aria-label="All reports" className="flex flex-col gap-3">
        <h2 className="font-display text-xl">All reports</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {REPORTS.filter((r) => mayRun(r, role)).map((r) => (
            <Link
              key={r.id}
              href={`/reports?report=${r.id}`}
              className="rounded-xl transition-colors hover:bg-ground"
            >
              <Card className="flex h-full flex-col gap-1">
                <span className="font-medium">{r.title} →</span>
                <span className="text-sm text-muted">{r.description}</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

async function RunReport({
  id,
  params,
  role,
}: {
  id: string;
  params: Record<string, string | string[] | undefined>;
  role: Role | null;
}) {
  const report = findReport(id);
  if (!report || !mayRun(report, role)) notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const values = readParams(report, params, today);
  const supabase = await createClient();
  const [result, customers] = await Promise.all([
    report.run(supabase, values),
    report.params.some((p) => p.kind === "customer")
      ? supabase.from("customers").select("id, name").order("name")
      : null,
  ]);
  const query = reportQuery(report, values);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href="/reports" className="text-sm text-muted underline underline-offset-4">
          ← All reports
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">{report.title}</h1>
        <p className="text-muted">{report.description}</p>
      </div>

      {report.params.length ? (
        <form
          method="get"
          action="/reports"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <input type="hidden" name="report" value={report.id} />
          {report.params.map((p) => (
            <label key={p.key} className="flex flex-col gap-1 text-xs font-medium text-muted">
              {p.label}
              {p.kind === "customer" ? (
                <select name={p.key} defaultValue={values[p.key]} className={filterInput}>
                  {(customers?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={p.kind === "month" ? "month" : "date"}
                  name={p.key}
                  defaultValue={values[p.key]}
                  className={`${filterInput} tabular-nums`}
                />
              )}
            </label>
          ))}
          <Button type="submit" variant="secondary" className="h-9">
            Run
          </Button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <a
          href={`/reports/export?format=pdf&${query}`}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Download PDF
        </a>
        <a
          href={`/reports/export?format=csv&${query}`}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Download for Excel (CSV)
        </a>
        <SaveViewForm
          list="reports"
          query={query}
          isOwner={false}
          summary="☆ Add to favourites"
          placeholder={report.title}
          roleDefaults={false}
        />
      </div>

      <ReportTable title={report.title} result={result} />
    </div>
  );
}
