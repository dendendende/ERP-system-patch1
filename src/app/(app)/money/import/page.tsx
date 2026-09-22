import { EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import bank statement · Cashflow" };

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, account_name, account_last4")
    .eq("is_active", true)
    .order("bank_name");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl">Import bank statement</h1>
        <p className="text-sm text-muted">
          We check the file first and show what&apos;s new. Importing the same file twice never adds
          anything twice.
        </p>
      </div>
      {accounts?.length ? (
        <ImportForm accounts={accounts} />
      ) : (
        <EmptyState title="No bank accounts yet">
          The owner needs to add a bank account before statements can be imported.
        </EmptyState>
      )}
    </div>
  );
}
