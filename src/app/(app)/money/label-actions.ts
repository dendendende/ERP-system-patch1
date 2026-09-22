"use server";

import { revalidatePath } from "next/cache";
import { payeeFromDescription } from "@/lib/bank/payee";
import { createClient } from "@/lib/supabase/server";

/**
 * Label one transaction. With `rule` ticked, also remember the payee so matching transactions
 * — past ones still waiting, and future ones — get the same category automatically.
 * Permissions are the database's job (RLS): viewers simply change nothing.
 */
export async function labelEntry(form: FormData) {
  const entryId = String(form.get("entryId") ?? "");
  // a suggestion button carries categoryId; the "Something else…" dropdown carries categoryIdOther
  const categoryId = String(form.get("categoryId") || form.get("categoryIdOther") || "");
  const alsoRule = form.get("rule") === "on";
  if (!entryId || !categoryId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("entries")
    .update({ category_id: categoryId })
    .eq("id", entryId);
  if (error) return;

  if (alsoRule) {
    const { data: entry } = await supabase
      .from("entries")
      .select("bank_transactions!inner (direction, description_raw)")
      .eq("id", entryId)
      .single();
    const pattern = payeeFromDescription(entry?.bank_transactions.description_raw ?? "");
    if (pattern) {
      await supabase.from("rules").insert({
        match_type: "contains",
        pattern,
        direction: entry!.bank_transactions.direction,
        category_id: categoryId,
        created_from_entry_id: entryId,
      });
      // Catch up the ones already waiting; it never touches anything already labelled.
      await supabase.rpc("apply_rules_to_unlabelled");
    }
  }

  revalidatePath("/money");
}
