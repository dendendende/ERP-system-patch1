// Gathers what the forecast needs, with the signed-in person's own permissions (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { type Cost, type Subscription, forecast } from "./forecast";

export async function loadForecast(supabase: SupabaseClient<Database>, today: string) {
  const [summary, bills, subs, costs, delays] = await Promise.all([
    supabase.rpc("money_summary").single(),
    supabase
      .from("invoices")
      .select("number, customer_id, due_on, amount_due::text, payments (amount_applied::text), customers (name)")
      .in("status", ["open", "partly_paid"]),
    supabase
      .from("subscriptions")
      .select("customer_id, plan_name, price::text, cycle, next_invoice_date, end_date, customers (name)")
      .eq("status", "active"),
    supabase
      .from("recurring_expenses")
      .select("name, expected_amount::text, frequency, day_of_month, start_date, end_date")
      .eq("is_active", true),
    supabase.from("customer_payment_delay").select("customer_id, avg_delay_days"),
  ]);
  const error = summary.error ?? bills.error ?? subs.error ?? costs.error ?? delays.error;
  if (error) throw new Error(`Couldn't load the forecast: ${error.message}`);

  const delayOf = new Map((delays.data ?? []).map((d) => [d.customer_id, Number(d.avg_delay_days ?? 0)]));
  const delay = (customerId: string | null) => (customerId ? (delayOf.get(customerId) ?? 0) : 0);

  return forecast({
    today,
    balance: BigInt(String(summary.data?.cash_in_bank ?? "0")),
    bills: (bills.data ?? []).map((b) => ({
      label: `${b.customers?.name ?? "A customer"} — ${b.number}`,
      owed: BigInt(b.amount_due) - b.payments.reduce((t, p) => t + BigInt(p.amount_applied), 0n),
      dueOn: b.due_on,
      customerDelayDays: delay(b.customer_id),
    })),
    subscriptions: (subs.data ?? []).map(
      (s): Subscription => ({
        label: `${s.customers?.name ?? "A customer"} — ${s.plan_name}`,
        price: BigInt(s.price),
        cycle: s.cycle as Subscription["cycle"],
        nextDueOn: s.next_invoice_date,
        endDate: s.end_date,
        customerDelayDays: delay(s.customer_id),
      }),
    ),
    costs: (costs.data ?? []).map(
      (c): Cost => ({
        label: c.name,
        amount: BigInt(c.expected_amount),
        frequency: c.frequency as Cost["frequency"],
        dayOfMonth: c.day_of_month,
        startDate: c.start_date,
        endDate: c.end_date,
      }),
    ),
  });
}
