"use server";

import { createClient } from "@/lib/supabase/server";

/** Opening the centre: what's there now is no longer new (for this person only). */
export async function markNotificationsSeen() {
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_seen");
}
