"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LimitState = { error?: string; ok?: string };

/** Change one health limit. Owner only (RLS), audited; only snapshots taken afterwards use it. */
export async function updateLimit(_prev: LimitState, form: FormData): Promise<LimitState> {
  const signal = String(form.get("signal") ?? "");
  const healthy = Number(form.get("healthy"));
  const warningRaw = form.get("warning");
  const warning = warningRaw === null ? null : Number(warningRaw);
  if (!Number.isFinite(healthy) || (warning !== null && !Number.isFinite(warning)))
    return { error: "Limits must be numbers." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("health_thresholds")
    .update(warning === null ? { healthy_limit: healthy } : { healthy_limit: healthy, warning_limit: warning })
    .eq("signal", signal)
    .select("signal");
  if (error) {
    return {
      error: error.code === "23514"
        ? "The warning limit has to sit on the unsafe side of the safe limit."
        : "Couldn't save. Try again.",
    };
  }
  // row-level security lets the update run but changes nothing when you may not
  if (!data?.length) return { error: "Only the owner can change health limits." };

  revalidatePath("/settings/health");
  return {
    ok: `Saved: safe limit ${healthy}${warning === null ? "" : `, danger limit ${warning}`}. The next daily check uses it; past checks stay as they were.`,
  };
}
