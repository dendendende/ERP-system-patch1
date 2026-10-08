"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RecordState = { error?: string; saved?: string };

/** Whole rupiah as typed ("12.500.000"); 0 allowed; minus only where it can happen (cash). */
function amount(form: FormData, name: string, allowNegative = false): bigint | null {
  const typed = String(form.get(name) ?? "").replace(/[.\s]/g, "");
  const pattern = allowNegative ? /^-?\d{1,18}$/ : /^\d{1,18}$/;
  return pattern.test(typed) ? BigInt(typed) : null;
}

export async function recordWeek(_prev: RecordState, form: FormData): Promise<RecordState> {
  const week = String(form.get("week") ?? "");
  const cameIn = amount(form, "came_in");
  const wentOut = amount(form, "went_out");
  const cash = amount(form, "cash", true);
  const owed = amount(form, "still_owed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || new Date(`${week}T00:00:00Z`).getUTCDay() !== 1) {
    return { error: "Choose the Monday the week started." };
  }
  if (cameIn === null || wentOut === null || cash === null || owed === null) {
    return { error: "Write each amount in whole rupiah, for example 12.500.000 (0 if none)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_parallel_week", {
    p_week_start: week,
    // rupiah as strings: JSON numbers lose precision above 2^53
    p_came_in: cameIn.toString() as unknown as number,
    p_went_out: wentOut.toString() as unknown as number,
    p_cash: cash.toString() as unknown as number,
    p_still_owed: owed.toString() as unknown as number,
    p_notes: String(form.get("notes") ?? "").trim(),
  });
  if (error) {
    return {
      error: /owner/.test(error.message)
        ? "Only the owner records the parallel run."
        : "Couldn't save that week. Try again.",
    };
  }
  revalidatePath("/settings/parallel-run");
  return { saved: week };
}
