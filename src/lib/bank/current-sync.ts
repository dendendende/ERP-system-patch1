import "server-only";
import { createClient } from "@/lib/supabase/server";
import { syncState, type SyncState } from "./sync-status";

/** Sync freshness across all connected (aggregator) accounts. */
export async function currentSyncState(): Promise<SyncState> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("last_synced_at")
    .eq("source", "aggregator")
    .eq("is_active", true);

  const times = (data ?? []).map((a) => a.last_synced_at).filter((t): t is string => !!t);
  return syncState(
    {
      connectedAccounts: data?.length ?? 0,
      // the oldest account decides: one silent bank is a problem even if another is fine
      lastSyncedAt:
        times.length === data?.length && times.length
          ? new Date(Math.min(...times.map(Date.parse)))
          : null,
    },
    new Date(),
  );
}
