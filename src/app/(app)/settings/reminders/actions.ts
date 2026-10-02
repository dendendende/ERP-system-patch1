"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StepState = { error?: string; ok?: string; at?: number };

/** Change one step of the reminder schedule. Owner only (RLS); audited; reminders not yet sent
 * follow the change, sent ones never do (database trigger). */
export async function updateStep(_prev: StepState, form: FormData): Promise<StepState> {
  const id = String(form.get("id") ?? "");
  const kind = String(form.get("kind") ?? "");
  const days = Number(form.get("days"));
  const when = form.get("when") === "after" ? 1 : -1;
  const isActive = form.get("is_active") === "on";
  const email = form.get("email") === "on";

  if (!Number.isInteger(days) || days < 0 || days > 60)
    return { error: "Days must be a whole number from 0 to 60." };
  const channels = kind === "escalate_team" ? [] : email ? ["email"] : [];
  if (kind !== "escalate_team" && channels.length === 0)
    return { error: "Choose how to reach them, or switch this step off." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_schedule")
    .update({ offset_days: days === 0 ? 0 : when * days, channels, is_active: isActive })
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Another step of the same kind is already on that day."
          : "Couldn't save. Try again.",
    };
  }
  // row-level security lets the update run but changes nothing when you may not
  if (!data?.length) return { error: "Only the owner can change the reminder schedule." };

  revalidatePath("/settings/reminders");
  return { ok: "Saved. Reminders not yet sent follow the new schedule.", at: Date.now() };
}
