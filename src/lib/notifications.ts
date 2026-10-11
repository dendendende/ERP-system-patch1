// The notifications centre's words (P9-T5): each one in a sentence, how serious, and the screen
// that shows it. The rows come from notifications() in the database; a bank that has stopped
// updating is added from the sync state while it lasts.
import type { SyncState } from "./bank/sync-status";
import { formatRupiah } from "./money";

export type NotificationRow = {
  kind: string;
  id: string;
  at: string;
  amount: string | null;
  who: string | null;
  detail: string | null;
  link_id: string | null;
  is_new: boolean;
};

export type Notice = {
  key: string;
  title: string;
  detail: string | null;
  href: string;
  tone: "problem" | "attention";
  at: string | null;
  isNew: boolean;
};

export function describeNotification(n: NotificationRow): Notice {
  const base = { key: `${n.kind}:${n.id}`, at: n.at, isNew: n.is_new };
  const amount = BigInt(n.amount ?? "0");
  const rupiah = formatRupiah(amount < 0n ? -amount : amount);
  switch (n.kind) {
    case "mismatch":
      return {
        ...base,
        title: `${n.who} doesn't add up: the bank shows ${rupiah} ${amount < 0n ? "less" : "more"} than our records`,
        detail: n.detail,
        href: `/money?account=${n.link_id}`,
        tone: "problem",
      };
    case "failed_delivery":
      return {
        ...base,
        title: `A reminder to ${n.who} couldn't be sent`,
        detail: n.detail,
        href: `/customers/${n.link_id}`,
        tone: "problem",
      };
    case "new_payee":
      return {
        ...base,
        title: `${rupiah} went to someone not paid before`,
        detail: n.who,
        href: `/money?open=${n.link_id}`,
        tone: "attention",
      };
    default:
      return {
        ...base,
        title: "Something needs a look",
        detail: n.detail,
        href: "/",
        tone: "attention",
      };
  }
}

/** The bank that has stopped updating: always counted while it lasts, it can't be "seen" away. */
export function syncNotice(sync: SyncState, staleHours: number): Notice | null {
  if (!sync.stale) return null;
  return {
    key: "sync",
    title: sync.message,
    detail: `Money that came in during the last ${staleHours} hours may be missing.`,
    href: "/settings/bank",
    tone: "attention",
    at: null,
    isNew: true,
  };
}
