"use server";

import { revalidatePath } from "next/cache";
import { parseRupiahInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type CostState = { error?: string; ok?: string; at?: number };

const PATH = "/money/regular-costs";
const FREQUENCIES = ["monthly", "quarterly", "yearly"];
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const denied = (message: string) =>
  message.includes("row-level security") ? "Only the owner can change regular costs." : "Couldn't save. Try again.";

/** Add a regular cost, or change one (when an id is sent). Owner only (RLS), audited. */
export async function saveCost(_prev: CostState, form: FormData): Promise<CostState> {
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const amount = parseRupiahInput(String(form.get("amount") ?? ""));
  const frequency = String(form.get("frequency") ?? "");
  const day = Number(form.get("day"));
  const startDate = String(form.get("startDate") ?? "");
  const endDate = String(form.get("endDate") ?? "");
  const isActive = form.get("isActive") !== "off";
  const pattern = String(form.get("pattern") ?? "") || null;
  const categoryId = String(form.get("categoryId") ?? "") || null;

  if (!name) return { error: "Give it a name, for example Office rent." };
  if (!amount) return { error: "Write the amount in rupiah, for example 12.000.000." };
  if (!FREQUENCIES.includes(frequency)) return { error: "Choose how often it's paid." };
  if (!Number.isInteger(day) || day < 1 || day > 31) return { error: "The day must be 1 to 31." };
  if (!isDate(startDate)) return { error: "Choose when it started." };
  if (endDate && (!isDate(endDate) || endDate < startDate))
    return { error: "The end date can't be before it started." };

  const row = {
    name,
    // rupiah as a string: JSON numbers lose precision above 2^53
    expected_amount: amount.toString() as unknown as number,
    frequency,
    day_of_month: day,
    start_date: startDate,
    end_date: endDate || null,
    is_active: isActive,
  };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("recurring_expenses").update(row).eq("id", id).select("id");
    if (error) return { error: denied(error.message) };
    if (!data?.length) return { error: "Only the owner can change regular costs." };
  } else {
    const { error } = await supabase
      .from("recurring_expenses")
      .insert({ ...row, source_pattern: pattern, category_id: categoryId });
    if (error) return { error: denied(error.message) };
  }
  revalidatePath(PATH);
  return { ok: id ? "Saved." : "Added.", at: Date.now() };
}

/** "Not a regular cost": this pattern is never suggested again. Owner only. */
export async function dismissSuggestion(_prev: CostState, form: FormData): Promise<CostState> {
  const pattern = String(form.get("pattern") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_suggestion_dismissals").insert({ pattern });
  if (error && error.code !== "23505") return { error: denied(error.message) };
  revalidatePath(PATH);
  return { ok: "Won't be suggested again.", at: Date.now() };
}
