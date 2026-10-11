import "server-only";
import { cache } from "react";
import { currentSyncState } from "@/lib/bank/current-sync";
import { staleAfterHours } from "@/lib/bank/sync-status";
import { type Notice, describeNotification, syncNotice } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

/** What needs a look, newest first (the stale bank on top). Once per request: the badge and the
 * page read the same list. Read with the person's own rights. */
export const loadNotices = cache(async (): Promise<Notice[]> => {
  const supabase = await createClient();
  const [{ data, error }, sync] = await Promise.all([
    supabase
      .rpc("notifications")
      .select("kind, id, at, amount::text, who, detail, link_id, is_new"),
    currentSyncState(),
  ]);
  if (error) throw new Error(`Notifications didn't load: ${error.message}`);
  const stale = syncNotice(sync, staleAfterHours());
  return [...(stale ? [stale] : []), ...(data ?? []).map(describeNotification)];
});
