import { notFound } from "next/navigation";
import { Bench } from "./bench";

export const metadata = { title: "Data table · Cashflow" };

/** 50,000 made-up rows, for the scrolling benchmark (e2e/data-table.spec.ts). */
export default function DataTablePage() {
  // development page; not part of the live app
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10">
      <h1 className="font-display text-3xl">Data table · 50,000 rows</h1>
      <Bench />
    </main>
  );
}
