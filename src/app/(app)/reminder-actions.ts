"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CloseState = { error?: string; done?: "sent" | "skipped"; at?: number };

/** A person sent this reminder themselves (or decided not to). Owner or operator; records who. */
export async function closeReminder(_prev: CloseState, form: FormData): Promise<CloseState> {
  const id = String(form.get("reminderId") ?? "");
  const sent = form.get("outcome") === "sent";

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_reminder", { p_reminder_id: id, p_sent: sent });
  if (error) {
    return {
      error: error.message.includes("Not allowed")
        ? "Only the owner or an operator can do this."
        : error.message.includes("already dealt with")
          ? "Someone already dealt with this one."
          : "Couldn't save. Try again.",
    };
  }
  revalidatePath("/");
  return { done: sent ? "sent" : "skipped", at: Date.now() };
}
