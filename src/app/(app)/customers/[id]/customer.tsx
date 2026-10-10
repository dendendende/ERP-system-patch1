import Link from "next/link";
import type { ReactNode } from "react";
import { type ObjectSection, ObjectPage } from "@/components/object-page";
import { Card, EmptyState, StatusPill } from "@/components/ui";
import { customerHeadline, longDay } from "@/lib/customer-summary";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { EditInvoice, NewInvoiceForm } from "./invoice-forms";
import { SendReminderNow } from "./reminder-controls";
import { Reminders } from "./reminders";
import { EditSubscription, NewSubscriptionForm } from "./subscription-forms";

const CYCLE: Record<string, string> = {
  monthly: "every month",
  quarterly: "every 3 months",
  yearly: "every year",
};

/** How much of the invoice is paid, as a bar. */
function PaidBar({ paid, total }: { paid: bigint; total: bigint }) {
  const percent = total > 0n ? Number((paid * 100n) / total) : 0;
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-ground"
      role="img"
      aria-label={`${percent}% paid`}
    >
      <div
        className="h-full rounded-full bg-in transition-[width] duration-200 ease-out"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

/**
 * One customer as an object page (P8-T8d): on its own page, or in the customers list's side
 * panel. Null when there is no such customer (or the reader may not see it).
 */
export async function customerView(
  id: string,
  mode: "page" | "panel",
): Promise<{ title: string; view: ReactNode } | null> {
  // today in Jakarta, as the form default
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: customer },
    { data: billing },
    { data: invoices },
    { data: subscriptions },
    { data: me },
    { data: contact },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, notes, reminders_paused")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("customer_billing")
      .select("still_owed::text, next_due, renews_on, is_late, is_renewing_soon, is_ongoing")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select(
        "id, number, status, notes, amount_due::text, transfer_amount::text, issued_on, due_on, payments (amount_applied::text)",
      )
      .eq("customer_id", id)
      .order("due_on", { ascending: false })
      // same due date: newest first, so a bill just written is always among the 20 shown
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("subscriptions")
      .select("id, plan_name, price::text, cycle, status, start_date, next_invoice_date, end_date")
      .eq("customer_id", id)
      .order("next_invoice_date"),
    // my own row: everyone can see the whole team, so ask for this user explicitly
    supabase
      .from("users")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    // phone and email: owner and operator only (empty for viewers — the database decides)
    supabase.rpc("customer_contacts").eq("customer_id", id).maybeSingle(),
  ]);
  if (!customer) return null;
  const canBill = me?.role === "owner" || me?.role === "operator";
  const isOwner = me?.role === "owner";

  const sum = (rows: { amount_applied: string }[]) =>
    rows.reduce((total, p) => total + BigInt(p.amount_applied), 0n);
  const owed = BigInt(billing?.still_owed ?? "0");
  const waiting = (invoices ?? []).filter((i) => i.status === "open" || i.status === "partly_paid");
  const paidOnWaiting = waiting.reduce((total, i) => total + sum(i.payments), 0n);
  const running = (subscriptions ?? []).filter((s) => s.status === "active");

  const bills = (
    <div className="flex flex-col gap-3">
      {canBill ? (
        <NewInvoiceForm customerId={customer.id} today={today} subscriptions={running} />
      ) : null}
      {invoices?.length ? (
        invoices.map((invoice) => {
          const total = BigInt(invoice.amount_due);
          const paid = sum(invoice.payments);
          const left = total - paid;
          const status = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.open;
          return (
            <Card
              key={invoice.id}
              id={`bill-${invoice.id}`}
              className="flex scroll-mt-6 flex-col gap-3 target:ring-2 target:ring-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/customers/${customer.id}/bills/${invoice.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {invoice.number}
                </Link>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </div>
              <PaidBar paid={paid} total={total} />
              <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                <div>
                  <dt className="text-muted">Bill</dt>
                  <dd>{formatRupiah(total)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Paid</dt>
                  <dd className={paid > 0n ? "text-in" : undefined}>{formatRupiah(paid)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Still owed</dt>
                  <dd>{formatRupiah(left > 0n ? left : 0n)}</dd>
                </div>
              </dl>
              {invoice.transfer_amount ? (
                <p className="rounded-lg bg-ground px-3 py-2 text-sm">
                  Ask them to transfer exactly{" "}
                  <strong className="tabular-nums">
                    {formatRupiah(BigInt(invoice.transfer_amount))}
                  </strong>{" "}
                  — the last digits tell us which bill it is.
                </p>
              ) : null}
              <p className="text-sm text-muted">
                Sent {longDay(invoice.issued_on)} · due {longDay(invoice.due_on)}
              </p>
              {canBill && invoice.transfer_amount && !customer.reminders_paused ? (
                <SendReminderNow invoiceId={invoice.id} customerId={customer.id} />
              ) : null}
              {canBill && invoice.status !== "void" ? (
                <EditInvoice
                  invoiceId={invoice.id}
                  customerId={customer.id}
                  dueOn={invoice.due_on}
                  notes={invoice.notes}
                  canVoid={invoice.status !== "paid"}
                  canMarkPaid={isOwner && invoice.status !== "paid"}
                />
              ) : null}
            </Card>
          );
        })
      ) : (
        <EmptyState title="No bills yet">
          Bills show up here as soon as a subscription renews, or when someone writes one.
        </EmptyState>
      )}
      {invoices?.length ? (
        <Link
          href={`/customers/bills?customer=${customer.id}`}
          className="self-start text-sm underline underline-offset-4"
        >
          All their bills, in the bills list
        </Link>
      ) : null}
    </div>
  );

  const plans = (
    <div className="flex flex-col gap-3">
      {subscriptions?.length ? (
        subscriptions.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{s.plan_name}</p>
              <p className="text-sm text-muted">
                {formatRupiah(BigInt(s.price))} {CYCLE[s.cycle] ?? s.cycle}
                {s.status === "active"
                  ? ` · next bill ${longDay(s.next_invoice_date)}`
                  : s.status === "paused"
                    ? " · paused"
                    : " · ended"}
                {s.end_date ? ` · runs until ${longDay(s.end_date)}` : ""}
              </p>
            </div>
            <StatusPill tone={s.status === "active" ? "in" : "neutral"}>
              {s.status === "active" ? "Running" : s.status === "paused" ? "Paused" : "Ended"}
            </StatusPill>
            {isOwner ? (
              <EditSubscription customerId={customer.id} subscription={s} today={today} />
            ) : null}
          </Card>
        ))
      ) : (
        <EmptyState title="No subscription">
          This customer isn&apos;t on a plan that renews by itself.
        </EmptyState>
      )}
      {isOwner ? <NewSubscriptionForm customerId={customer.id} today={today} /> : null}
    </div>
  );

  const sections: ObjectSection[] = [
    { id: "bills", title: "Bills", bare: true, content: bills },
    { id: "subscription", title: "Subscription", bare: true, content: plans },
    {
      id: "sent",
      title: "What we've sent them",
      short: "Sent",
      bare: true,
      content: (
        <Reminders customerId={customer.id} paused={customer.reminders_paused} canAct={canBill} />
      ),
    },
    ...(customer.notes
      ? [
          {
            id: "notes",
            title: "Notes",
            content: <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>,
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
                href={`/settings/audit-log?record=${customer.id}`}
                className="text-sm underline underline-offset-4"
              >
                See every change to this customer
              </Link>
            ),
          },
        ]
      : []),
  ];

  // as a year first (like yearly_value() in the database), so nothing is rounded twice
  const yearly = running.reduce(
    (t, s) =>
      t + BigInt(s.price) * (s.cycle === "monthly" ? 12n : s.cycle === "quarterly" ? 4n : 1n),
    0n,
  );

  return {
    title: customer.name,
    view: (
      <ObjectPage
        mode={mode}
        back={{ href: "/customers", label: "All customers" }}
        eyebrow="Customer"
        title={customer.name}
        headline={
          <p className="max-w-2xl text-lg text-muted">
            {customerHeadline({
              owed,
              paid: paidOnWaiting,
              dueOn: billing?.next_due ?? null,
              isLate: billing?.is_late ?? false,
              renewsOn: billing?.renews_on ?? null,
            })}
          </p>
        }
        status={
          <>
            {billing?.is_late ? (
              <StatusPill tone="problem">Late</StatusPill>
            ) : billing?.is_renewing_soon ? (
              <StatusPill tone="attention">Renewing soon</StatusPill>
            ) : billing?.is_ongoing ? (
              <StatusPill tone="in">Active</StatusPill>
            ) : (
              <StatusPill>Ended</StatusPill>
            )}
            {customer.reminders_paused ? <StatusPill>Reminders paused</StatusPill> : null}
          </>
        }
        actions={
          mode === "panel" ? (
            <Link
              href={`/customers/${customer.id}`}
              className="text-sm underline underline-offset-4"
            >
              Open as a page
            </Link>
          ) : null
        }
        facts={[
          { label: "Still owed", value: formatRupiah(owed) },
          {
            label: "Next due",
            value: billing?.next_due ? longDay(billing.next_due) : "Nothing due",
          },
          {
            label: "Renews",
            value: billing?.renews_on ? longDay(billing.renews_on) : "No renewal planned",
          },
          // ÷ 12 to the nearest rupiah, like MRR on Home
          {
            label: "Subscriptions a month",
            value: running.length ? formatRupiah((yearly + 6n) / 12n) : "None running",
          },
          ...(contact?.whatsapp_number
            ? [{ label: "WhatsApp", value: contact.whatsapp_number }]
            : []),
          ...(contact?.billing_email ? [{ label: "Email", value: contact.billing_email }] : []),
        ]}
        sections={sections}
      />
    ),
  };
}
