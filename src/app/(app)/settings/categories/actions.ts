"use server";

import { revalidatePath } from "next/cache";
import type { TablesUpdate } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/categories";

/** Switch a rule on or off, or change what it files things under. Owner-only (RLS). */
export async function updateRule(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!id) return;
  const patch: TablesUpdate<"rules"> = {};
  if (form.has("is_active")) patch.is_active = form.get("is_active") === "true";
  if (form.has("category_id") && form.get("category_id"))
    patch.category_id = String(form.get("category_id"));
  if (form.has("priority")) patch.priority = Number(form.get("priority")) || 0;

  const supabase = await createClient();
  await supabase.from("rules").update(patch).eq("id", id);
  revalidatePath(PATH);
  revalidatePath("/money");
}

export type CategoryState = { error?: string; added?: string };

export async function addCategory(_prev: CategoryState, form: FormData): Promise<CategoryState> {
  const name = String(form.get("name") ?? "").trim();
  const type = form.get("type") === "in" ? "in" : "out";
  if (!name) return { error: "Give the category a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    // report_group only drives reports; custom ones land in the catch-all group
    .insert({ name, type, report_group: type === "in" ? "other_income" : "other" });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "There is already a category with that name."
          : "Couldn't add that category.",
    };
  }
  revalidatePath(PATH);
  return { added: name };
}

export async function deleteCategory(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("categories").delete().eq("id", id);
  revalidatePath(PATH);
}
