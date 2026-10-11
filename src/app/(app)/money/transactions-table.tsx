"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { panelHref } from "@/components/analytical-list-page";
import { type Column, DataTable } from "@/components/data-table";
import { type LabelCategory, LabelBar } from "../bulk-bars";
import { Money, StatusPill } from "@/components/ui";
import { type MoneyFilters, moneyHref } from "@/lib/money-filters";

export type TransactionRow = {
  id: string;
  occurred_at: string;
  amount: string;
  direction: string;
  description: string;
  account: string | null;
  category: string | null;
  status: string;
  invoice_number: string | null;
  counterparty: string;
  note: string;
  by_hand: boolean;
};

/** Who and what for, as people wrote them — minus what the description already says. */
const detailsOf = (t: TransactionRow) =>
  [t.counterparty, t.note].filter((d) => d && d !== t.description).join(" · ");

const shortDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "2-digit",
});

/** Money in & out's list. Sorting, paging and the CSV are the server's, so they cover every page. */
export function TransactionsTable({
  rows,
  filters,
  listHref,
  openId,
  toolbar,
  total,
  net,
  labels,
}: {
  rows: TransactionRow[];
  filters: MoneyFilters;
  /** This list's address: a row opens beside it, in the side panel. */
  listHref: string;
  /** The row open in the side panel. */
  openId: string | null;
  toolbar: ReactNode;
  /** How many match, across all pages. */
  total: number;
  /** Came in − went out of all that match (own transfers left out), as text: bigint-safe. */
  net: string;
  /** owner or operator: the categories to label ticked rows with (none: no tick boxes) */
  labels?: LabelCategory[];
}) {
  const [key, dir] = filters.sort.split("_") as ["date" | "amount", "asc" | "desc"];
  const columns: Column<TransactionRow>[] = [
    {
      key: "date",
      label: "Date",
      sort: true,
      className: "text-muted",
      cell: (t) => shortDay.format(new Date(t.occurred_at)),
    },
    {
      key: "description",
      label: "Description",
      className: "w-full max-w-0 truncate",
      // one line, always: the list is drawn in rows of a fixed height
      cell: (t) => {
        const details = detailsOf(t);
        return (
          <>
            {t.by_hand ? (
              <span className="mr-2 rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand-deep">
                By hand
              </span>
            ) : null}
            {/* opens in the side panel; the list stays where it was scrolled to */}
            <Link
              href={panelHref(listHref, t.id)}
              scroll={false}
              title={details ? `${t.description} · ${details}` : t.description}
              className="font-medium underline-offset-4 hover:underline"
            >
              {t.description}
            </Link>
            {details ? <span className="text-muted"> · {details}</span> : null}
          </>
        );
      },
      footer: `Difference, all ${total.toLocaleString("id-ID")} matching (own transfers left out)`,
    },
    {
      key: "account",
      label: "Account",
      optional: true,
      className: "hidden text-muted xl:table-cell",
      cell: (t) => t.account,
    },
    {
      key: "category",
      label: "Category",
      optional: true,
      // phones: date, description, amount; labelling happens in "Needs a label" above
      className: "hidden sm:table-cell",
      cell: (t) => (
        <>
          {t.status === "needs_label" ? (
            <StatusPill tone="attention">Needs label</StatusPill>
          ) : (
            t.category
          )}
          {t.invoice_number ? <span className="ml-2 text-muted">· {t.invoice_number}</span> : null}
        </>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sort: true,
      cell: (t) => <Money amount={BigInt(t.amount)} direction={t.direction as "in" | "out"} />,
      footer: <Money amount={BigInt(net)} direction={BigInt(net) < 0n ? "out" : "in"} />,
    },
  ];
  return (
    <DataTable
      id="money"
      label="Transactions matching the filters"
      rows={rows}
      rowKey={(t) => t.id}
      columns={columns}
      activeKey={openId ?? undefined}
      sort={{ key, dir }}
      sortHref={(s) => moneyHref(filters, { sort: `${s.key}_${s.dir}` as MoneyFilters["sort"] })}
      csvHref={moneyHref({ ...filters, page: 1 }, {}, "/money/export")}
      toolbar={toolbar}
      bulkActions={
        labels
          ? (ticked, clear, say) => (
              <LabelBar ticked={ticked} categories={labels} clear={clear} say={say} />
            )
          : undefined
      }
    />
  );
}
