"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { panelHref } from "@/components/analytical-list-page";
import { type Column, DataTable } from "@/components/data-table";
import { BillsBar } from "../../bulk-bars";
import { Money, StatusPill } from "@/components/ui";
import { type BillFilters, billHref } from "@/lib/bill-filters";
import { INVOICE_STATUS } from "@/lib/invoice-status";

export type BillRow = {
  id: string;
  number: string;
  customer_id: string;
  customer: string;
  status: string;
  due_on: string;
  billed: string;
  paid: string;
  owed: string;
  days_late: number;
};

const shortDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "2-digit",
});

/** What the bill's state is, in words: lateness first, since that is what needs doing. */
function State({ b }: { b: BillRow }) {
  if (b.days_late > 0)
    return (
      <StatusPill tone="problem">
        {b.days_late} {b.days_late === 1 ? "day" : "days"} late
      </StatusPill>
    );
  const s = INVOICE_STATUS[b.status] ?? INVOICE_STATUS.open;
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
}

/** The bills list. Sorting, paging and the CSV are the server's, so they cover every page. */
export function BillsTable({
  rows,
  filters,
  listHref,
  openId,
  toolbar,
  total,
  owed,
  canAct,
}: {
  rows: BillRow[];
  filters: BillFilters;
  /** This list's address: a bill opens beside it, in the side panel. */
  listHref: string;
  openId: string | null;
  toolbar: ReactNode;
  /** How many match, across all pages. */
  total: number;
  /** Still owed on all that match, as text (bigint-safe). */
  owed: string;
  /** owner or operator: tick bills to remind about or cancel them together */
  canAct: boolean;
}) {
  const [key, dir] = filters.sort.split("_") as ["due" | "owed", "asc" | "desc"];
  const columns: Column<BillRow>[] = [
    {
      key: "number",
      label: "Bill",
      className: "whitespace-nowrap",
      // opens in the side panel; the list stays where it was scrolled to
      cell: (b) => (
        <Link
          href={panelHref(listHref, b.id)}
          scroll={false}
          className="font-medium tabular-nums underline-offset-4 hover:underline"
        >
          {b.number}
        </Link>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      className: "w-full max-w-0 truncate",
      // a customer's name narrows the list to their bills
      cell: (b) => (
        <Link
          href={billHref(filters, { customer: b.customer_id })}
          title={`Only ${b.customer}'s bills`}
          className="underline-offset-4 hover:underline"
        >
          {b.customer}
        </Link>
      ),
      footer: `Still owed, all ${total.toLocaleString("id-ID")} matching`,
    },
    {
      key: "due",
      label: "Due",
      sort: true,
      className: "whitespace-nowrap text-muted tabular-nums",
      cell: (b) => shortDay.format(new Date(`${b.due_on}T00:00:00Z`)),
    },
    {
      key: "state",
      label: "Status",
      className: "hidden sm:table-cell",
      cell: (b) => <State b={b} />,
    },
    {
      key: "billed",
      label: "Bill amount",
      align: "right",
      optional: true,
      className: "hidden lg:table-cell",
      cell: (b) => <Money amount={BigInt(b.billed)} />,
    },
    {
      key: "paid",
      label: "Paid",
      align: "right",
      optional: true,
      className: "hidden lg:table-cell",
      cell: (b) => <Money amount={BigInt(b.paid)} />,
    },
    {
      key: "owed",
      label: "Still owed",
      align: "right",
      sort: true,
      cell: (b) =>
        BigInt(b.owed) > 0n ? (
          <Money amount={BigInt(b.owed)} />
        ) : (
          <span className="text-muted">—</span>
        ),
      footer: <Money amount={BigInt(owed)} />,
    },
  ];
  return (
    <DataTable
      id="bills"
      label="Bills matching the filters"
      rows={rows}
      rowKey={(b) => b.id}
      columns={columns}
      activeKey={openId ?? undefined}
      sort={{ key, dir }}
      sortHref={(s) => billHref(filters, { sort: `${s.key}_${s.dir}` as BillFilters["sort"] })}
      csvHref={billHref({ ...filters, page: 1 }, {}, "/customers/bills/export")}
      toolbar={toolbar}
      bulkActions={
        canAct
          ? (ticked, clear, say) => <BillsBar ticked={ticked} clear={clear} say={say} />
          : undefined
      }
    />
  );
}
