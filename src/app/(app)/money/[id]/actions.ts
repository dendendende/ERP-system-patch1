"use server";

import { revalidatePath } from "next/cache";
import { parseRupiahInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/** Change the category and note of one transaction. RLS decides who may. */
export async function updateEntry(form: FormData) {
  const entryId = String(form.get("entryId") ?? "");
  const transactionId = String(form.get("transactionId") ?? "");
  const categoryId = String(form.get("categoryId") ?? "");
  const note = String(form.get("note") ?? "").slice(0, 500);
  if (!entryId) return;

  const supabase = await createClient();
  await supabase
    .from("entries")
    .update({ category_id: categoryId || null, note })
    .eq("id", entryId);

  revalidatePath(`/money/${transactionId}`);
  revalidatePath("/money");
}

export type MatchState = { error?: string; ok?: string; at?: number };

/** Say which bill this transfer paid: records a payment, audited, and links the entry to it. */
export async function matchToInvoice(_prev: MatchState, form: FormData): Promise<MatchState> {
  const transactionId = String(form.get("transactionId") ?? "");
  const entryId = String(form.get("entryId") ?? "");
  const invoiceId = String(form.get("invoiceId") ?? "");
  const amount = parseRupiahInput(String(form.get("amount") ?? ""));
  if (!invoiceId) return { error: "Choose which bill this paid." };
  if (!amount) return { error: "Write how much of this transfer paid the bill." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_payment", {
    p_invoice_id: invoiceId,
    p_bank_transaction_id: transactionId,
    // rupiah as a string: JSON numbers lose precision above 2^53
    p_amount: amount.toString() as unknown as number,
    p_method: "manual",
  });
  if (error) {
    return {
      error: error.message.includes("Not allowed")
        ? "Only the owner or an operator can match a transfer to a bill."
        : // the database says these in plain words already
          error.message.replace(/^.*ERROR:\s*/, ""),
    };
  }

  // the entry now points at the bill and its customer, like an automatic match does
  const { data: invoice } = await supabase
    .from("invoices")
    .select("customer_id, status")
    .eq("id", invoiceId)
    .maybeSingle();
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("type", "in")
    .eq("is_system", true)
    .eq("name", invoice?.status === "paid" ? "Subscription income" : "Partial payment")
    .maybeSingle();
  await supabase
    .from("entries")
    .update({
      invoice_id: invoiceId,
      customer_id: invoice?.customer_id ?? null,
      category_id: category?.id ?? null,
    })
    .eq("id", entryId);

  revalidatePath(`/money/${transactionId}`);
  revalidatePath("/money");
  return { ok: "Matched to the bill.", at: Date.now() };
}
