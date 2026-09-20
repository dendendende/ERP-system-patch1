"use server";

import { revalidatePath } from "next/cache";
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
