import Link from "next/link";
import type { ReactNode } from "react";
import { type ObjectSection, ObjectPage } from "@/components/object-page";
import { StatusPill } from "@/components/ui";
import { longDay } from "@/lib/customer-summary";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { EditInvoice } from "../../invoice-forms";
import { SendReminderNow } from "../../reminder-controls";
import { Reminders } from "../../reminders";

/**
 * One bill as an object page (P8-T8b): on its own page, or in the bills list's side panel.
 * Null when there is no such bill (or the reader may not see it).
 */
export async function billView(
  invoiceId: string,
  mode: "page" | "panel",
): Promise<{ title: string; customerId: string; view: ReactNode } | null> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: bill }, { data: owedRow }, { data: me }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, number, status, notes, void_reason, base_amount::text, transfer_amount::text, issued_on, due_on, customer_id,
         customers (name, reminders_paused), subscriptions (plan_name), payments (amount_applied::text)`,
      )
      .eq("id", invoiceId)
      .maybeSingle(),
    // still owed today: the same number as the bills list and every receivables total
    supabase.rpc("invoice_owed_on", { p_on: today }).eq("invoice_id", invoiceId).maybeSingle(),
    supabase
      .from("users")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);
  if (!bill?.customers) return null;

  const canBill = me?.role === "owner" || me?.role === "operator";
  const isOwner = me?.role === "owner";
  const billed = BigInt(bill.base_amount);
  const paid = bill.payments.reduce((t, p) => t + BigInt(p.amount_applied), 0n);
  const owed = BigInt(owedRow?.owed ?? 0);
  const daysLate =
    owed > 0n ? Math.round((Date.parse(today) - Date.parse(bill.due_on)) / 86_400_000) : 0;
  const status = INVOICE_STATUS[bill.status] ?? INVOICE_STATUS.open;
  const customer = bill.customers;

  const sections: ObjectSection[] = [
    {
      id: "timeline",
      title: "Payments and messages",
      short: "Timeline",
      bare: true,
      content: (
        <Reminders
          customerId={bill.customer_id}
          invoiceId={bill.id}
          paused={customer.reminders_paused}
          canAct={canBill}
        />
      ),
    },
    ...(canBill && bill.transfer_amount && !customer.reminders_paused
      ? [
          {
            id: "remind",
            title: "Remind them now",
            short: "Remind",
            content: <SendReminderNow invoiceId={bill.id} customerId={bill.customer_id} />,
          },
        ]
      : []),
    ...(canBill && bill.status !== "void"
      ? [
          {
            id: "change",
            title: "Change this bill",
            short: "Change",
            description:
              "Every change is kept in the change history. A cancelled bill stays on record.",
            content: (
              <EditInvoice
                invoiceId={bill.id}
                customerId={bill.customer_id}
                dueOn={bill.due_on}
                notes={bill.notes}
                canVoid={bill.status !== "paid"}
                canMarkPaid={isOwner && bill.status !== "paid"}
              />
            ),
          },
        ]
      : []),
    ...(bill.notes || bill.void_reason
      ? [
          {
            id: "notes",
            title: "Notes",
            content: (
              <div className="flex flex-col gap-1 text-sm whitespace-pre-wrap">
                {bill.void_reason ? <p>Cancelled because: {bill.void_reason}</p> : null}
                {bill.notes ? <p>{bill.notes}</p> : null}
              </div>
            ),
          },
        ]
      : []),
    // the change log is the owner's to read
    ...(isOwner
      ? [
          {
            id: "history",
            title: "Change history",
            short: "History",
            content: (
              <Link
                href={`/settings/audit-log?record=${bill.id}`}
                className="text-sm underline underline-offset-4"
              >
                See every change to this bill
              </Link>
            ),
          },
        ]
      : []),
  ];

  return {
    title: bill.number,
    customerId: bill.customer_id,
    view: (
      <ObjectPage
        mode={mode}
        back={{ href: "/customers/bills", label: "Bills" }}
        eyebrow={`Bill · ${customer.name}`}
        title={bill.number}
        headline={
          <p className="font-display text-4xl tabular-nums">
            {formatRupiah(owed)}
            <span className="ml-2 font-sans text-base text-muted">still owed</span>
          </p>
        }
        status={
          <>
            {daysLate > 0 ? (
              <StatusPill tone="problem">
                {daysLate} {daysLate === 1 ? "day" : "days"} late
              </StatusPill>
            ) : null}
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {customer.reminders_paused ? <StatusPill>Reminders paused</StatusPill> : null}
          </>
        }
        actions={
          <>
            {bill.status !== "void" ? (
              <a
                href={`/customers/${bill.customer_id}/bills/${bill.id}/pdf`}
                className="text-sm underline underline-offset-4"
              >
                Download PDF
              </a>
            ) : null}
            {mode === "panel" ? (
              <Link
                href={`/customers/${bill.customer_id}/bills/${bill.id}`}
                className="text-sm underline underline-offset-4"
              >
                Open as a page
              </Link>
            ) : null}
          </>
        }
        facts={[
          {
            label: "Customer",
            value: (
              <Link
                href={`/customers/${bill.customer_id}`}
                className="underline underline-offset-4"
              >
                {customer.name}
              </Link>
            ),
          },
          { label: "Bill", value: formatRupiah(billed) },
          { label: "Paid", value: formatRupiah(paid) },
          { label: "Due", value: longDay(bill.due_on) },
          { label: "Sent", value: longDay(bill.issued_on) },
          { label: "For", value: bill.subscriptions?.plan_name ?? "A one-off bill" },
          ...(bill.transfer_amount
            ? [{ label: "Transfer exactly", value: formatRupiah(BigInt(bill.transfer_amount)) }]
            : []),
        ]}
        sections={sections}
      />
    ),
  };
}
