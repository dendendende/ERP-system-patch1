"use server";

import { revalidatePath } from "next/cache";
import type { Problem } from "@/components/action-form";
import type { TablesUpdate } from "@/lib/database.types";
import { NOT_SAVED, answer } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/categories";

/** Switch a rule on or off, or change what it files things under. Owner-only (RLS). */
export async function updateRule(_prev: Problem, form: FormData): Promise<Problem> {
  const id = String(form.get("id") ?? "");
  if (!id) return { error: NOT_SAVED };
  const patch: TablesUpdate<"rules"> = {};
  if (form.has("is_active")) patch.is_active = form.get("is_active") === "true";
  if (form.has("category_id") && form.get("category_id"))
    patch.category_id = String(form.get("category_id"));
  if (form.has("priority")) patch.priority = Number(form.get("priority")) || 0;

  const supabase = await createClient();
  const saved = answer(await supabase.from("rules").update(patch).eq("id", id).select("id"));
  if (saved.error) return saved;
  revalidatePath(PATH);
  revalidatePath("/money");
  return saved;
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

export async function deleteCategory(_prev: Problem, form: FormData): Promise<Problem> {
  const id = String(form.get("id") ?? "");
  if (!id) return { error: NOT_SAVED };
  const supabase = await createClient();
  const r = await supabase.from("categories").delete().eq("id", id).select("id");
  // 23503: a rule or a regular cost still files things under it
  if (r.error?.code === "23503")
    return { error: "A rule or a regular cost still uses this category, so it stays." };
  const removed = answer(r);
  if (!removed.error) revalidatePath(PATH);
  return removed;
}
