"use client";

import { useMemo } from "react";
import { type Column, DataTable } from "@/components/data-table";
import { Button, Money } from "@/components/ui";

type Row = { id: string; day: string; payee: string; category: string; amount: bigint };

const PAYEES = ["PT Maju Jaya", "CV Sinar Abadi", "Toko Sumber Rezeki", "PLN", "Telkom", "Gojek"];
const CATEGORIES = ["Subscriptions", "Salaries", "Rent", "Internet", "Transport"];

/** The same 50,000 rows every time (a fixed pseudo-random sequence), signed: + in, − out. */
function makeRows(count: number): Row[] {
  let seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(2026, 0, 1) + (i % 365) * 86_400_000).toISOString().slice(0, 10);
    const amount = BigInt(next() % 50_000_000) * (next() % 3 === 0 ? 1n : -1n);
    return {
      id: String(i + 1),
      day,
      payee: `${PAYEES[next() % PAYEES.length]} #${i + 1}`,
      category: CATEGORIES[next() % CATEGORIES.length],
      amount,
    };
  });
}

const cmp = <T,>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0);

export function Bench() {
  const rows = useMemo(() => makeRows(50_000), []);
  const net = useMemo(() => rows.reduce((sum, r) => sum + r.amount, 0n), [rows]);
  const columns: Column<Row>[] = [
    {
      key: "day",
      label: "Date",
      sort: (a, b) => cmp(a.day, b.day),
      csv: (r) => r.day,
      cell: (r) => r.day,
    },
    {
      key: "payee",
      label: "Description",
      className: "w-full max-w-0 truncate",
      sort: (a, b) => cmp(a.payee, b.payee),
      csv: (r) => r.payee,
      cell: (r) => r.payee,
      footer: "All 50,000",
    },
    {
      key: "category",
      label: "Category",
      optional: true,
      csv: (r) => r.category,
      cell: (r) => r.category,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sort: (a, b) => cmp(a.amount, b.amount),
      csv: (r) => r.amount,
      cell: (r) => <Money amount={r.amount} direction={r.amount < 0n ? "out" : "in"} />,
      footer: <Money amount={net} />,
    },
  ];
  return (
    <DataTable
      id="bench"
      label="Made-up transactions"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      toolbar="50,000 rows"
      bulkActions={(ticked) => (
        <Button type="button" variant="secondary" className="h-8">
          Total of ticked: <Money amount={ticked.reduce((s, r) => s + r.amount, 0n)} />
        </Button>
      )}
    />
  );
}
