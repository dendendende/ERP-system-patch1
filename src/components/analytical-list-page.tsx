import type { ReactNode } from "react";
import { SidePanel } from "./side-panel";
import { Card } from "./ui";

// The workhorse list floorplan (P7-T6, UPGRADE-v2 §3.3), one shape for Money in & out, Bills,
// Customers and Reminders, top to bottom:
//   title + actions → notices → filter bar (+ saved views) → totals → chart strip → table,
// and a side panel for the row that's open, so drilling down never loses the place in the list.
// It only lays things out; each page brings its own filters, charts, table and panel content.

export function AnalyticalListPage({
  title,
  actions,
  notices,
  filters,
  totals,
  charts = [],
  table,
  tableLabel,
  panel,
}: {
  title: string;
  /** Top right, e.g. "Add money in or out". */
  actions?: ReactNode;
  /** Banners and inboxes that need attention before the list. */
  notices?: ReactNode;
  /** The FilterBar, and the saved views under it. */
  filters?: ReactNode;
  /** Totals of what's listed (cues). */
  totals?: ReactNode;
  /** 0–3 small charts of the filtered rows; clicking a bar narrows the list. */
  charts?: ReactNode[];
  table: ReactNode;
  /** What the list is, for screen readers, e.g. "Transactions". */
  tableLabel: string;
  /** The open row's details, shown beside the list (null: nothing open). */
  panel?: { title: string; closeHref: string; content: ReactNode } | null;
}) {
  return (
    // data-panel-open lets the app frame widen while a panel is open (see the (app) layout)
    <div
      data-panel-open={panel ? "" : undefined}
      className={
        panel ? "xl:grid xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start xl:gap-6" : undefined
      }
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
          {actions ? <div className="flex flex-wrap items-center gap-4">{actions}</div> : null}
        </div>
        {notices}
        {filters}
        {totals}
        {charts.length ? (
          <section
            aria-label="Charts"
            className={`grid gap-3 ${charts.length > 1 ? "md:grid-cols-2" : ""} ${charts.length > 2 ? "2xl:grid-cols-3" : ""}`}
          >
            {charts.map((chart, i) => (
              <Card key={i} className="min-w-0 p-4">
                {chart}
              </Card>
            ))}
          </section>
        ) : null}
        <section aria-label={tableLabel} className="flex flex-col gap-2">
          {table}
        </section>
      </div>
      {panel ? (
        <SidePanel title={panel.title} closeHref={panel.closeHref}>
          {panel.content}
        </SidePanel>
      ) : null}
    </div>
  );
}

/** The list's address with one row opened in the panel (or closed: id null). */
export function panelHref(listHref: string, id: string | null) {
  const [path, query = ""] = listHref.split("?");
  const params = new URLSearchParams(query);
  if (id) params.set("open", id);
  else params.delete("open");
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
