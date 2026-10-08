"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRupiahInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type RecordState = { error?: string };

/** Money recorded by hand: one row, marked as typed by this person. RLS decides who may. */
export async function recordByHand(_prev: RecordState, form: FormData): Promise<RecordState> {
  const direction = form.get("direction");
  const amount = parseRupiahInput(String(form.get("amount") ?? ""));
  const day = String(form.get("day") ?? "");
  const account = String(form.get("account") ?? "");
  if (direction !== "in" && direction !== "out") return { error: "Choose money in or money out." };
  if (!amount) return { error: "Write the amount in whole rupiah, e.g. 1.500.000." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Choose the date." };
  if (!account) return { error: "Choose which account the money was in." };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("record_by_hand", {
    p_key: String(form.get("key") ?? ""),
    p_account: account,
    p_day: day,
    p_direction: direction,
    // rupiah as a string: JSON numbers lose precision above 2^53
    p_amount: amount.toString() as unknown as number,
    p_counterparty: String(form.get("counterparty") ?? "").slice(0, 200),
    p_note: String(form.get("note") ?? "").slice(0, 500),
    p_category: String(form.get("category") ?? "") || undefined,
  });
  if (error || !id) {
    return {
      error:
        error?.code === "42501"
          ? "Only the owner or an operator can record money."
          : error?.code === "23514"
            ? // the database says these in plain words already
              error.message
            : "It wasn't saved. Try again.",
    };
  }
  revalidatePath("/money");
  revalidatePath("/");
  redirect(`/money/new?saved=${id}&dir=${direction}`);
}
