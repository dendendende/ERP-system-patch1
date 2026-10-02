import Link from "next/link";
import { Card, TableRow } from "@/components/ui";
import { type CompanyAccount, companyAccount } from "@/lib/company";
import { formatRupiah } from "@/lib/money";
import { renderMessage } from "@/lib/reminders/templates";
import { createClient } from "@/lib/supabase/server";
import { SendByHand } from "./send-by-hand";

// The lists on Home: what someone should do today.

/** Bills so late that messages have stopped and a person should call (P3-T9). P4-T4 folds this
 * into the full Today list. */
export async function CallTheseCustomers() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("team_escalations")
    .select("invoice_id, number, customer_id, customer_name, phone, days_late, still_owed::text")
    .order("days_late", { ascending: false })
    .limit(10);
  if (!rows?.length) return null;
  return (
    <section aria-label="Call these customers" className="flex flex-col gap-3">
      <h2 className="font-display text-xl">Call these customers</h2>
      <Card className="p-0">
        {rows.map((r) => (
          <TableRow
            key={r.invoice_id}
            primary={
              <Link href={`/customers/${r.customer_id}`} className="hover:underline underline-offset-4">
                Call {r.customer_name}, {r.days_late} days late
              </Link>
            }
            secondary={`${r.number}${r.phone ? ` · ${r.phone}` : ""} · reminders have stopped; a person should call`}
            amount={formatRupiah(BigInt(r.still_owed ?? "0"))}
          />
        ))}
      </Card>
    </section>
  );
}

const MESSAGE_NAME: Record<string, string> = {
  invoice: "Send the bill",
  reminder: "Reminder",
  due_tomorrow: "Due tomorrow",
  overdue: "Late notice",
  thank_you: "Say thank you",
};

/** Reminders that are due: a person sends each one (automatic sending is on hold). */
export async function RemindersToSend() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: rows, error }, { data: me }] = await Promise.all([
    supabase
      .from("reminders_to_send")
      .select(
        "reminder_id, invoice_id, number, customer_id, customer_name, email, phone, language, template_key, kind, offset_days, due_on, amount_due::text, amount_to_transfer::text, still_owed::text, waiting_for_bank",
      )
      .order("scheduled_for")
      .limit(30),
    supabase.from("users").select("role").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  if (error || !rows?.length) return null;
  const canAct = me?.role === "owner" || me?.role === "operator";

  let account: CompanyAccount | null = null;
  try {
    account = companyAccount();
  } catch {
    // shown below: without the fixed account there is nothing safe to send
  }

  return (
    <section aria-label="Reminders to send" className="flex flex-col gap-3">
      <h2 className="font-display text-xl">Reminders to send</h2>
      <p className="text-sm text-muted">
        These are due. Send each one yourself (or ask Cowork to), then mark it as sent.
      </p>
      {account ? null : (
        <p className="rounded-lg bg-attention-bg px-3 py-2 text-sm text-attention-ink">
          The company bank account isn&apos;t set up, so the messages can&apos;t be written yet.
        </p>
      )}
      <Card className="p-0">
        {rows.map((r) => {
          const stillOwed = BigInt(r.still_owed ?? "0");
          const message =
            account && r.template_key
              ? renderMessage(
                  r.template_key,
                  r.language === "en" ? "en" : "id",
                  {
                    customerName: r.customer_name ?? "",
                    invoiceNumber: r.number ?? "",
                    amountToTransfer: r.amount_to_transfer ? BigInt(r.amount_to_transfer) : null,
                    stillOwed,
                    paidSoFar: BigInt(r.amount_due ?? "0") - stillOwed,
                    dueOn: r.due_on ?? "",
                  },
                  account,
                )
              : null;
          const what =
            r.kind === "reminder" && r.offset_days
              ? `${-r.offset_days}-day reminder`
              : r.kind === "overdue" && r.offset_days
                ? `${r.offset_days} days late`
                : (MESSAGE_NAME[r.template_key ?? ""] ?? "Reminder");
          return (
            <div key={r.reminder_id} className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {what} ·{" "}
                  <Link href={`/customers/${r.customer_id}`} className="hover:underline underline-offset-4">
                    {r.customer_name}
                  </Link>{" "}
                  <span className="font-normal text-muted">· {r.number}</span>
                </p>
                {r.template_key === "thank_you" ? null : (
                  <span className="text-sm tabular-nums">{formatRupiah(stillOwed)}</span>
                )}
              </div>
              {r.waiting_for_bank ? (
                <p className="rounded-lg bg-attention-bg px-3 py-2 text-sm text-attention-ink">
                  Wait: the bank hasn&apos;t been checked since this became late — they may already
                  have paid. Check again after the next bank update.
                </p>
              ) : null}
              {!r.email && !r.phone ? (
                <p className="text-sm text-muted">No email or WhatsApp number saved for them.</p>
              ) : null}
              {message && r.reminder_id ? (
                <SendByHand
                  reminderId={r.reminder_id}
                  subject={message.subject}
                  body={message.body}
                  email={r.email}
                  phone={r.phone}
                  pdfUrl={
                    r.template_key === "invoice"
                      ? `/customers/${r.customer_id}/bills/${r.invoice_id}/pdf`
                      : undefined
                  }
                  canAct={canAct}
                />
              ) : null}
            </div>
          );
        })}
      </Card>
    </section>
  );
}

/** What happened today, and what is waiting: payments the app matched, reminders sent, labels. */
export async function TodayActivity({ today }: { today: string }) {
  const supabase = await createClient();
  const since = `${today}T00:00:00+07:00`;
  const [payments, sent, unlabelled] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount_applied::text, invoices (number, customer_id, customers (name))")
      .eq("method", "auto")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("reminders")
      .select("id, template_key, invoices (number, customer_id, customers (name)), reminder_schedule (kind)")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(20),
    supabase.from("entries").select("id", { count: "exact", head: true }).eq("status", "needs_label"),
  ]);

  const items = [
    ...(payments.data ?? []).map((p) => ({
      key: `p-${p.id}`,
      href: `/customers/${p.invoices?.customer_id}`,
      text: `${p.invoices?.customers?.name ?? "A customer"} paid ${p.invoices?.number} — matched by the app`,
      amount: formatRupiah(BigInt(p.amount_applied)),
    })),
    ...(sent.data ?? []).map((r) => ({
      key: `r-${r.id}`,
      href: `/customers/${r.invoices?.customer_id}`,
      text: `Reminder sent to ${r.invoices?.customers?.name ?? "a customer"} for ${r.invoices?.number}`,
      amount: null,
    })),
  ];
  const needsLabel = unlabelled.count ?? 0;
  if (!items.length && !needsLabel) return null;

  return (
    <section aria-label="Today" className="flex flex-col gap-3">
      <h2 className="font-display text-xl">Today</h2>
      <Card className="p-0">
        {needsLabel ? (
          <TableRow
            primary={
              <Link href="/money" className="hover:underline underline-offset-4">
                {needsLabel} {needsLabel === 1 ? "transaction needs" : "transactions need"} a label
              </Link>
            }
            secondary="Say what they were for, so the numbers stay right"
            amount={null}
          />
        ) : null}
        {items.map((i) => (
          <TableRow
            key={i.key}
            primary={
              <Link href={i.href} className="hover:underline underline-offset-4">
                {i.text}
              </Link>
            }
            amount={i.amount}
          />
        ))}
      </Card>
    </section>
  );
}
