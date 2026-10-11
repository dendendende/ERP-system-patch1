import { EmptyState } from "@/components/ui";
import { loadNotices } from "./data";
import { NoticeList } from "./notice-list";

export const metadata = { title: "Notifications · Cashflow" };

// Notifications (P9-T5): what needs a look, from the last 14 days — balances that don't add up,
// a bank that stopped updating, reminders that couldn't be sent, big payments to someone new.
export default async function NotificationsPage() {
  const notices = await loadNotices();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl md:text-4xl">Notifications</h1>
        <p className="text-muted">
          What needs a look, from the last 14 days. Each one opens the screen that shows it.
        </p>
      </div>
      {notices.length ? (
        <NoticeList notices={notices} />
      ) : (
        <EmptyState title="Nothing needs a look">
          Balances add up, the bank is updating, every reminder went out, and no big payment went to
          someone new.
        </EmptyState>
      )}
    </div>
  );
}
