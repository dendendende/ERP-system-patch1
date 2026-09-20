"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BankFormState = { error?: string; added?: string };

/** Owner-only in the database (RLS); the form is only shown to owners. */
export async function addBankAccount(_prev: BankFormState, form: FormData): Promise<BankFormState> {
  const bank_name = String(form.get("bank_name") ?? "").trim();
  const account_name = String(form.get("account_name") ?? "").trim();
  const account_last4 = String(form.get("account_last4") ?? "").trim();
  const source = form.get("source") === "aggregator" ? "aggregator" : "csv";

  if (!bank_name || !account_name) return { error: "Fill in the bank and the account name." };
  if (!/^\d{4}$/.test(account_last4)) return { error: "Last 4 digits: exactly four numbers." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .insert({ bank_name, account_name, account_last4, source });
  if (error) {
    return {
      error:
        error.code === "42501" ? "Only the owner can add accounts." : "Couldn't add that account.",
    };
  }

  revalidatePath("/settings/bank");
  return { added: `${bank_name} ••${account_last4}` };
}

export async function setAccountActive(form: FormData) {
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("bank_accounts").update({ is_active: active }).eq("id", id);
  revalidatePath("/settings/bank");
}
