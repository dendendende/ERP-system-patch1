// "Is the bank data fresh?" — one answer, used by the sidebar, Home and Bank connections.

/** Hours without a successful sync before we call it stale. Set SYNC_STALE_HOURS to change it. */
export const staleAfterHours = () => Number(process.env.SYNC_STALE_HOURS) || 6;

export type SyncState = {
  tone: "neutral" | "in" | "attention";
  message: string;
  stale: boolean;
};

/** Plain words for how long ago something happened. */
export function timeAgo(from: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function syncState(
  { connectedAccounts, lastSyncedAt }: { connectedAccounts: number; lastSyncedAt: Date | null },
  now: Date,
  staleHours = staleAfterHours(),
): SyncState {
  if (connectedAccounts === 0) {
    return { tone: "neutral", message: "Bank not connected yet", stale: false };
  }
  if (!lastSyncedAt) {
    return { tone: "attention", message: "Waiting for the first bank update", stale: true };
  }
  const stale = now.getTime() - lastSyncedAt.getTime() > staleHours * 3_600_000;
  const ago = timeAgo(lastSyncedAt, now);
  return stale
    ? { tone: "attention", message: `No bank update since ${ago}`, stale: true }
    : { tone: "in", message: `Bank updated ${ago}`, stale: false };
}
