"use server";

import { revalidatePath } from "next/cache";
import type { Problem } from "@/components/action-form";
import { NOT_SAVED, answer } from "@/lib/db-error";
import { CANCELLED_CATEGORY, parseRupiahInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/** Change the category and details of one transaction. RLS decides who may. */
export async function updateEntry(_prev: Problem, form: FormData): Promise<Problem> {
  const entryId = String(form.get("entryId") ?? "");
  const transactionId = String(form.get("transactionId") ?? "");
  const categoryId = String(form.get("categoryId") ?? "");
  const note = String(form.get("note") ?? "")
    .trim()
    .slice(0, 500);
  const counterparty = String(form.get("counterparty") ?? "")
    .trim()
    .slice(0, 200);
  if (!entryId) return { error: NOT_SAVED };

  const supabase = await createClient();
  const saved = answer(
    await supabase
      .from("entries")
      .update({ category_id: categoryId || null, note, counterparty })
      .eq("id", entryId)
      .select("id"),
  );
  if (saved.error) return saved;

  revalidatePath(`/money/${transactionId}`);
  revalidatePath("/money");
  return {};
}

/** A hand entry typed by mistake: filed as cancelled, so no total counts it. It stays on record
 * (and in the history), and choosing another category brings it back. The database refuses this
 * for money the bank sent, and for money that paid a bill. */
export async function cancelHandEntry(_prev: Problem, form: FormData): Promise<Problem> {
  const entryId = String(form.get("entryId") ?? "");
  const transactionId = String(form.get("transactionId") ?? "");
  const direction = form.get("direction") === "in" ? "in" : "out";
  const supabase = await createClient();
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("is_system", true)
    .eq("type", direction)
    .eq("name", CANCELLED_CATEGORY)
    .maybeSingle();
  if (!entryId || !category) return { error: NOT_SAVED };
  const saved = answer(
    await supabase
      .from("entries")
      .update({ category_id: category.id })
      .eq("id", entryId)
      .select("id"),
  );
  if (saved.error) return saved;

  revalidatePath(`/money/${transactionId}`);
  revalidatePath("/money");
  return {};
}

export type MatchState = { error?: string; ok?: string; at?: number };

/** Say which bill this transfer paid: records a payment, audited, and links the entry to it. */
export async function matchToInvoice(_prev: MatchState, form: FormData): Promise<MatchState> {
  const transactionId = String(form.get("transactionId") ?? "");
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

  // apply_payment also pointed the entry at the bill and its customer, in the same transaction
  revalidatePath(`/money/${transactionId}`);
  revalidatePath("/money");
  return { ok: "Matched to the bill.", at: Date.now() };
}
