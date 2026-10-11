"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { panelHref } from "@/components/analytical-list-page";
import { type Column, DataTable } from "@/components/data-table";
import { CustomersBar } from "../bulk-bars";
import { Money, StatusPill } from "@/components/ui";

export type CustomerRow = {
  id: string;
  name: string;
  still_owed: string;
  next_due: string | null;
  renews_on: string | null;
  is_late: boolean;
  is_renewing_soon: boolean;
  is_ongoing: boolean;
};

const shortDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "2-digit",
});
const day = (d: string | null) => (d ? shortDay.format(new Date(`${d}T00:00:00Z`)) : "");

const state = (c: CustomerRow) =>
  c.is_late ? "Late" : c.is_renewing_soon ? "Renewing soon" : c.is_ongoing ? "Active" : "Ended";
const TONE = {
  Late: "problem",
  "Renewing soon": "attention",
  Active: "in",
  Ended: "neutral",
} as const;

const owed = (c: CustomerRow) => BigInt(c.still_owed ?? "0");
const byBig = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
// no date sorts last either way round it's read (a customer with nothing due)
const byDay = (a: string | null, b: string | null) => (a ?? "9999").localeCompare(b ?? "9999");

/** The customers list: every customer is held here, so sorting happens right in the browser. */
export function CustomersTable({
  rows,
  listHref,
  openId,
  toolbar,
  canAct,
}: {
  rows: CustomerRow[];
  /** This list's address: a customer opens beside it, in the side panel. */
  listHref: string;
  openId: string | null;
  toolbar: ReactNode;
  /** owner or operator: tick customers to remind them all at once */
  canAct: boolean;
}) {
  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      label: "Customer",
      className: "w-full max-w-0 truncate",
      sort: (a, b) => a.name.localeCompare(b.name),
      csv: (c) => c.name,
      // opens in the side panel; the list stays where it was scrolled to
      cell: (c) => (
        <Link
          href={panelHref(listHref, c.id)}
          scroll={false}
          className="font-medium underline-offset-4 hover:underline"
        >
          {c.name}
        </Link>
      ),
    },
    {
      key: "state",
      label: "Status",
      className: "hidden sm:table-cell",
      csv: state,
      cell: (c) => <StatusPill tone={TONE[state(c)]}>{state(c)}</StatusPill>,
    },
    {
      key: "next_due",
      label: "Next due",
      optional: true,
      className: "hidden md:table-cell whitespace-nowrap text-muted tabular-nums",
      sort: (a, b) => byDay(a.next_due, b.next_due),
      csv: (c) => c.next_due ?? "",
      cell: (c) => day(c.next_due),
    },
    {
      key: "renews_on",
      label: "Renews",
      optional: true,
      className: "hidden lg:table-cell whitespace-nowrap text-muted tabular-nums",
      sort: (a, b) => byDay(a.renews_on, b.renews_on),
      csv: (c) => (c.is_ongoing ? (c.renews_on ?? "") : ""),
      cell: (c) => (c.is_ongoing ? day(c.renews_on) : ""),
    },
    {
      key: "owed",
      label: "Still owed",
      align: "right",
      sort: (a, b) => byBig(owed(a), owed(b)),
      csv: owed,
      cell: (c) =>
        owed(c) > 0n ? <Money amount={owed(c)} /> : <span className="text-muted">—</span>,
    },
  ];
  return (
    <DataTable
      id="customers"
      label="Customers matching the filters"
      rows={rows}
      rowKey={(c) => c.id}
      columns={columns}
      activeKey={openId ?? undefined}
      toolbar={toolbar}
      bulkActions={
        canAct
          ? (ticked, clear, say) => <CustomersBar ticked={ticked} clear={clear} say={say} />
          : undefined
      }
    />
  );
}
