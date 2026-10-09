"use client";

import Link from "next/link";
import { panelHref } from "@/components/analytical-list-page";
import { type Column, DataTable } from "@/components/data-table";
import { Money } from "@/components/ui";

export type DemoRow = {
  id: string;
  day: string;
  payee: string;
  category: string;
  direction: "in" | "out";
  amount: string;
};

export function DemoTable({
  rows,
  listHref,
  openId,
}: {
  rows: DemoRow[];
  listHref: string;
  openId?: string;
}) {
  const columns: Column<DemoRow>[] = [
    { key: "day", label: "Date", className: "text-muted", cell: (r) => r.day },
    {
      key: "payee",
      label: "Description",
      className: "w-full max-w-0 truncate",
      // opens in the side panel; the list stays where it was scrolled to
      cell: (r) => (
        <Link
          href={panelHref(listHref, r.id)}
          scroll={false}
          className="font-medium underline-offset-4 hover:underline"
        >
          {r.payee}
        </Link>
      ),
    },
    { key: "category", label: "Category", optional: true, cell: (r) => r.category },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      cell: (r) => <Money amount={BigInt(r.amount)} direction={r.direction} />,
    },
  ];
  return (
    <DataTable
      id="dev-list"
      label="Made-up transactions"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      activeKey={openId}
      toolbar={<p className="tabular-nums">{rows.length} transactions</p>}
    />
  );
}
