"use server";

import { revalidatePath } from "next/cache";
import { type BulkRow, bulkIds, bulkOutcome } from "@/lib/bulk";
import { createClient } from "@/lib/supabase/server";

// Bulk actions on ticked rows (P9-T4). The database does each row with the same rules as one
// at a time, audits each, and says why for any it couldn't (bulk_* functions). Viewers are
// refused there too; the lists only offer these to the owner and operators.

const refused = (message: string) =>
  message.includes("Not allowed") ? "Only the owner or an operator can do this." : message;

async function outcome(
  call: PromiseLike<{ data: BulkRow[] | null; error: { message: string } | null }>,
  done: (n: number) => string,
) {
  const { data, error } = await call;
  if (error) return { error: refused(error.message) };
  return { said: bulkOutcome(data ?? [], done) };
}

const many = (n: number, one: string, more: string) =>
  `${n.toLocaleString("id-ID")} ${n === 1 ? one : more}`;

/** Give every ticked transaction the same category. */
export async function bulkLabel(transactionIds: string[], categoryId: string) {
  const [category] = bulkIds([categoryId]);
  if (!category) return { error: "Choose a category." };
  const supabase = await createClient();
  const result = await outcome(
    supabase.rpc("bulk_label", {
      p_transaction_ids: bulkIds(transactionIds),
      p_category_id: category,
    }),
    (n) => `${many(n, "transaction", "transactions")} labelled.`,
  );
  revalidatePath("/money", "layout");
  revalidatePath("/");
  return result;
}

const remindedIn = (n: number) =>
  `${many(n, "reminder is", "reminders are")} on "Reminders to send" on Home.`;

/** A reminder for each ticked bill, on today's list. */
export async function bulkRemind(invoiceIds: string[]) {
  const supabase = await createClient();
  const result = await outcome(
    supabase.rpc("bulk_send_reminder_now", { p_invoice_ids: bulkIds(invoiceIds) }),
    remindedIn,
  );
  revalidatePath("/customers", "layout");
  revalidatePath("/");
  return result;
}

/** A reminder for every bill the ticked customers still owe. */
export async function bulkRemindCustomers(customerIds: string[]) {
  const supabase = await createClient();
  const { data: bills, error } = await supabase
    .from("invoices")
    .select("id")
    .in("customer_id", bulkIds(customerIds))
    .in("status", ["open", "partly_paid"]);
  if (error) return { error: "Couldn't find their bills. Try again." };
  if (!bills.length)
    return { said: "None of them owe anything, so there's nothing to remind about." };
  return bulkRemind(bills.map((b) => b.id));
}

/** Cancel the ticked bills (only those nothing was paid towards), with one reason. */
export async function bulkVoid(invoiceIds: string[], reason: string) {
  const why = reason.trim().slice(0, 300);
  if (!why) return { error: "Say why the bills are being cancelled." };
  const supabase = await createClient();
  const result = await outcome(
    supabase.rpc("bulk_void_invoices", { p_invoice_ids: bulkIds(invoiceIds), p_reason: why }),
    (n) => `${many(n, "bill", "bills")} cancelled.`,
  );
  revalidatePath("/customers", "layout");
  revalidatePath("/");
  return result;
}
