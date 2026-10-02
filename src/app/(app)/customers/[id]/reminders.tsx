import type { ReactNode } from "react";
import { Card, EmptyState, StatusPill, type Tone } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { PauseReminders } from "./reminder-controls";

// "What we've sent them": every reminder (sent, queued or stopped) and every payment that came
// in, newest first — one place to see how a customer's bill has gone.

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** The message, in plain words. */
function what(kind: string | null, offset: number | null, template: string | null) {
  if (template === "thank_you") return "Thank you for paying";
  switch (kind ?? template) {
    case "invoice":
      return "The bill";
    case "reminder":
      return offset === null ? "Reminder, added by hand" : `Reminder, ${-offset} days before`;
    case "due_tomorrow":
      return "Due tomorrow";
    case "overdue":
      return offset === null ? "Late notice, added by hand" : `${offset} days late`;
    default:
      return template ?? kind ?? "Message";
  }
}

function reminderStatus(
  r: { status: string; kind: string | null; scheduled_for: string; by_hand: boolean },
  now: number,
) {
  const due = Date.parse(r.scheduled_for) <= now;
  const table: Record<string, [string, Tone]> = {
    scheduled:
      due && r.kind === "overdue"
        ? ["Waiting for a bank update", "attention"]
        : [due ? "To send — on Home" : "Scheduled", due ? "attention" : "neutral"],
    sent: [r.by_hand ? "Sent by hand" : "Sent", "in"],
    delivered: ["Delivered", "in"],
    read: ["Read", "in"],
    failed: ["Failed", "problem"],
    cancelled: ["Not sent", "neutral"],
  };
  return table[r.status] ?? [r.status, "neutral"];
}

/** Money inside a sentence: tabular digits for the amount only. */
const money = (amount: string) => <span className="tabular-nums">{formatRupiah(BigInt(amount))}</span>;

const PAID_HOW: Record<string, string> = {
  auto: "matched by the app",
  manual: "matched by someone",
  no_transfer: "marked paid without a transfer",
};

type Event = {
  key: string;
  at: string;
  title: ReactNode;
  detail: ReactNode;
  pill: [string, Tone];
};

export async function Reminders({
  customerId,
  paused,
  canAct,
}: {
  customerId: string;
  paused: boolean;
  canAct: boolean;
}) {
  const supabase = await createClient();
  const [reminders, payments] = await Promise.all([
    supabase
      .from("reminders")
      .select(
        `id, channel, status, error, scheduled_for, sent_at, amount_shown::text, template_key, sent_by,
         invoices!inner (number, customer_id), reminder_schedule (kind, offset_days)`,
      )
      .eq("invoices.customer_id", customerId)
      // a cancelled reminder whose day never came was never going to happen: not worth a line
      .or(`status.neq.cancelled,scheduled_for.lte.${new Date().toISOString()}`)
      .order("scheduled_for", { ascending: false })
      .limit(50),
    supabase
      .from("payments")
      .select(
        `id, amount_applied::text, method, reason, created_at,
         invoices!inner (number, customer_id), bank_transactions (occurred_at)`,
      )
      .eq("invoices.customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const controls = canAct ? <PauseReminders customerId={customerId} paused={paused} /> : null;
  const banner = paused ? (
    <p className="rounded-lg bg-attention-bg px-3 py-2 text-sm text-attention-ink">
      Reminders are paused for this customer. Nothing is sent until they are turned back on.
    </p>
  ) : null;

  if (reminders.error || payments.error)
    return <p className="text-sm text-problem">Couldn&apos;t load what we&apos;ve sent. Try again.</p>;

  // eslint-disable-next-line react-hooks/purity -- a server component renders once per request
  const now = Date.now();
  const events: Event[] = [
    ...(reminders.data ?? []).map((r): Event => {
      const kind = r.reminder_schedule?.kind ?? r.template_key;
      const amount = r.amount_shown ? <> · asked for {money(r.amount_shown)}</> : null;
      const why = r.status === "cancelled" || r.status === "failed" ? ` · ${r.error ?? ""}` : "";
      return {
        key: `r-${r.id}`,
        at: r.sent_at ?? r.scheduled_for,
        title: `${what(kind, r.reminder_schedule?.offset_days ?? null, r.template_key)} · ${r.invoices.number} · ${r.channel === "whatsapp" ? "WhatsApp" : "Email"}`,
        detail: (
          <>
            {when.format(new Date(r.sent_at ?? r.scheduled_for))}
            {amount}
            {why}
          </>
        ),
        pill: reminderStatus({ ...r, kind, by_hand: r.sent_by !== null }, now),
      };
    }),
    ...(payments.data ?? []).map((p): Event => {
      const at = p.bank_transactions?.occurred_at ?? p.created_at;
      return {
        key: `p-${p.id}`,
        at,
        title: (
          <>
            {money(p.amount_applied)} came in for {p.invoices.number}
          </>
        ),
        detail: `${when.format(new Date(at))} · ${PAID_HOW[p.method] ?? p.method}${p.reason ? ` · ${p.reason}` : ""}`,
        pill: ["Payment", "in"],
      };
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <div className="flex flex-col gap-3">
      {banner}
      {events.length ? (
        <Card className="p-0">
          <ul>
            {events.map((e) => (
              <li
                key={e.key}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-sm last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.title}</p>
                  <p className="text-muted">{e.detail}</p>
                </div>
                <StatusPill tone={e.pill[1]}>{e.pill[0]}</StatusPill>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title="Nothing sent yet">
          Reminders are queued by themselves when a bill is written.
        </EmptyState>
      )}
      {controls}
    </div>
  );
}
