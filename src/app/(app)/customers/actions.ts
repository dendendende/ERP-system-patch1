"use server";

import { redirect } from "next/navigation";
import { toWhatsappNumber } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type AddCustomerState = { error?: string };

/** Owner or operator (RLS). Opens the new customer's page, where the subscription goes. */
export async function addCustomer(
  _prev: AddCustomerState,
  form: FormData,
): Promise<AddCustomerState> {
  const name = String(form.get("name") ?? "").trim();
  const phoneTyped = String(form.get("whatsapp") ?? "").trim();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const language = form.get("language") === "en" ? "en" : "id";

  if (!name) return { error: "Write the customer's name." };
  const whatsapp = phoneTyped ? toWhatsappNumber(phoneTyped) : null;
  if (phoneTyped && !whatsapp)
    return { error: "That WhatsApp number doesn't look right, for example 0812 3456 7890." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "That email doesn't look right." };
  if (!whatsapp && !email)
    return { error: "Add a WhatsApp number or an email, so reminders can reach them." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ name, whatsapp_number: whatsapp, billing_email: email || null, language })
    .select("id")
    .single();
  if (error || !data) {
    return {
      error: error?.message.includes("row-level security")
        ? "Only the owner or an operator can add customers."
        : "Couldn't add the customer. Try again.",
    };
  }
  redirect(`/customers/${data.id}`);
}
