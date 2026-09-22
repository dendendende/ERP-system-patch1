"use server";

import { revalidatePath } from "next/cache";
import { parseRupiahInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string; at?: number };

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function createInvoice(_prev: FormState, form: FormData): Promise<FormState> {
  const customerId = String(form.get("customerId") ?? "");
  const amount = parseRupiahInput(String(form.get("amount") ?? ""));
  const issuedOn = String(form.get("issuedOn") ?? "");
  const dueOn = String(form.get("dueOn") ?? "");
  const notes = String(form.get("notes") ?? "").slice(0, 500);
  const subscriptionId = String(form.get("subscriptionId") ?? "");

  if (!amount) return { error: "Write the amount in rupiah, for example 1.500.000." };
  if (!isDate(issuedOn) || !isDate(dueOn)) return { error: "Choose both dates." };
  if (dueOn < issuedOn) return { error: "The due date can't be before the bill is sent." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invoice", {
    p_customer_id: customerId,
    // rupiah as a string: JSON numbers lose precision above 2^53
    p_base_amount: amount.toString() as unknown as number,
    p_issued_on: issuedOn,
    p_due_on: dueOn,
    p_subscription_id: subscriptionId || undefined,
    p_notes: notes,
  });
  if (error) {
    return {
      error: error.message.includes("Not allowed")
        ? "Only the owner or an operator can write a bill."
        : "Couldn't write the bill. Try again.",
    };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: "Bill written.", at: Date.now() };
}

/** The only parts of a bill anyone may change. A different amount means void and write a new one. */
export async function updateInvoice(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("invoiceId") ?? "");
  const customerId = String(form.get("customerId") ?? "");
  const dueOn = String(form.get("dueOn") ?? "");
  const notes = String(form.get("notes") ?? "").slice(0, 500);
  if (!isDate(dueOn)) return { error: "Choose a due date." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ due_on: dueOn, notes })
    .eq("id", id)
    .select("id");
  if (error) return { error: "Couldn't save the change. Try again." };
  // row-level security lets the update run but changes nothing when you may not
  if (!data?.length) return { error: "Only the owner or an operator can change a bill." };

  revalidatePath(`/customers/${customerId}`);
  return { ok: "Saved.", at: Date.now() };
}

export async function voidInvoice(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("invoiceId") ?? "");
  const customerId = String(form.get("customerId") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!reason) return { error: "Say why this bill is being cancelled." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", { p_invoice_id: id, p_reason: reason });
  if (error) {
    return {
      error: error.message.includes("Not allowed")
        ? "Only the owner or an operator can cancel a bill."
        : error.message.includes("still waiting")
          ? "This bill is already paid or cancelled."
          : "Couldn't cancel the bill. Try again.",
    };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: "Bill cancelled.", at: Date.now() };
}
