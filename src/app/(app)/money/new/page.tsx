import Link from "next/link";
import { Card, EmptyState, Money } from "@/components/ui";
import { CANCELLED_CATEGORY } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { AddMoneyHeader } from "../import-prompt";
import { RecordForm } from "./record-form";

export const metadata = { title: "Add money in or out · Cashflow" };

export default async function RecordMoneyPage({ searchParams }: PageProps<"/money/new">) {
  const { saved, dir } = await searchParams;
  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }, { data: last }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("id, bank_name, account_name, account_last4")
      .eq("is_active", true)
      .order("bank_name"),
    supabase
      .from("categories")
      .select("id, name, type")
      .neq("name", CANCELLED_CATEGORY)
      .order("name"),
    typeof saved === "string"
      ? supabase
          .from("bank_transactions")
          .select("id, amount::text, direction, description_raw")
          .eq("id", saved)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <AddMoneyHeader way="new" />
      <div>
        <p className="text-sm text-muted">
          For cash, or money the bank statement hasn&apos;t shown yet. It&apos;s marked as entered
          by you. When the statement with the same money is imported later, cancel this one so it
          doesn&apos;t count twice.
        </p>
      </div>

      {last ? (
        <Card
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-in/30 bg-in/5"
        >
          <span className="font-medium text-in">Saved</span>
          <Money amount={BigInt(last.amount)} direction={last.direction as "in" | "out"} />
          <span className="min-w-0 truncate text-sm text-muted">{last.description_raw}</span>
          <Link href={`/money/${last.id}`} className="ml-auto text-sm underline underline-offset-4">
            Open it
          </Link>
        </Card>
      ) : null}

      {accounts?.length ? (
        <RecordForm
          // a fresh key each time the page is drawn: one form, one transaction, even on a double click
          key={typeof saved === "string" ? saved : "first"}
          formKey={crypto.randomUUID()}
          direction={dir === "out" ? "out" : "in"}
          today={today}
          accounts={accounts.map((a) => ({
            id: a.id,
            label: `${a.bank_name} · ${a.account_name} ••${a.account_last4}`,
          }))}
          categories={categories ?? []}
        />
      ) : (
        <EmptyState title="No accounts yet">
          The owner needs to add an account first (a bank account, or one for cash) in Settings.
        </EmptyState>
      )}
    </div>
  );
}
