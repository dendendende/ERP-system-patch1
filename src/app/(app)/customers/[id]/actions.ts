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

const CYCLES = ["monthly", "quarterly", "yearly"];
const STATUSES = ["active", "paused", "ended"];

/** Fields shared by writing and changing a subscription. */
function readSubscription(form: FormData) {
  const price = parseRupiahInput(String(form.get("price") ?? ""));
  const plan = String(form.get("plan") ?? "").trim().slice(0, 100);
  const cycle = String(form.get("cycle") ?? "");
  const startDate = String(form.get("startDate") ?? "");
  const nextInvoiceDate = String(form.get("nextInvoiceDate") ?? "");
  const endDate = String(form.get("endDate") ?? "");
  const status = String(form.get("status") ?? "active");

  if (!plan) return { error: "Give the plan a name, for example Starter." };
  if (!price) return { error: "Write the price in rupiah, for example 1.500.000." };
  if (!CYCLES.includes(cycle)) return { error: "Choose how often it renews." };
  if (!isDate(startDate) || !isDate(nextInvoiceDate)) return { error: "Choose both dates." };
  if (endDate && !isDate(endDate)) return { error: "That end date isn't a date." };
  if (endDate && endDate < startDate) return { error: "The end date can't be before it starts." };
  if (!STATUSES.includes(status)) return { error: "Choose whether it is running." };

  return {
    row: {
      plan_name: plan,
      // rupiah as a string: JSON numbers lose precision above 2^53
      price: price.toString() as unknown as number,
      cycle,
      start_date: startDate,
      next_invoice_date: nextInvoiceDate,
      end_date: endDate || null,
      status,
    },
  };
}

export async function createSubscription(_prev: FormState, form: FormData): Promise<FormState> {
  const customerId = String(form.get("customerId") ?? "");
  const parsed = readSubscription(form);
  if (!parsed.row) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .insert({ ...parsed.row, customer_id: customerId });
  if (error) {
    return {
      error: error.message.includes("row-level security")
        ? "Only the owner can set up a subscription."
        : "Couldn't save the subscription. Try again.",
    };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: "Subscription saved.", at: Date.now() };
}

export async function updateSubscription(_prev: FormState, form: FormData): Promise<FormState> {
  const customerId = String(form.get("customerId") ?? "");
  const id = String(form.get("subscriptionId") ?? "");
  const parsed = readSubscription(form);
  if (!parsed.row) return { error: parsed.error };

  console.log("DEBUG update", JSON.stringify(parsed.row));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .update(parsed.row)
    .eq("id", id)
    .select("id");
  if (error) return { error: "Couldn't save the change. Try again." };
  // row-level security lets the update run but changes nothing when you may not
  if (!data?.length) return { error: "Only the owner can change a subscription." };

  revalidatePath(`/customers/${customerId}`);
  return { ok: "Saved.", at: Date.now() };
}

/** Owner only: count a bill as paid although no transfer will arrive (cash, a swap, a write-off). */
export async function markPaidWithoutTransfer(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const id = String(form.get("invoiceId") ?? "");
  const customerId = String(form.get("customerId") ?? "");
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (!reason) return { error: "Say why this bill counts as paid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_invoice_paid", {
    p_invoice_id: id,
    p_reason: reason,
  });
  if (error) {
    return {
      error: error.message.includes("Only the owner")
        ? "Only the owner can mark a bill paid without a transfer."
        : error.message.includes("not waiting for money")
          ? "This bill is already paid or cancelled."
          : "Couldn't mark it paid. Try again.",
    };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: "Marked paid.", at: Date.now() };
}
