"use server";

import { containsPattern } from "@/lib/command-palette";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Global search (P7-T9): customers, bills and transactions in one box. It runs as the person
// signed in, so it finds only what row-level security lets them see.

export type FoundGroup = {
  name: "Customers" | "Bills" | "Transactions";
  items: { label: string; sub: string; href: string }[];
};

const EACH = 5;
const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export async function searchEverything(typed: string): Promise<FoundGroup[]> {
  const q = typed.trim().slice(0, 100);
  if (q.length < 2) return [];
  const like = containsPattern(q);
  const supabase = await createClient();
  const [customers, bills, transactions] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, is_active")
      .ilike("name", like)
      .order("is_active", { ascending: false })
      .order("name")
      .limit(EACH),
    supabase
      .from("invoices")
      .select("id, number, status, customer_id, amount_due::text, customers!inner (name)")
      .ilike("number", like)
      .order("issued_on", { ascending: false })
      .limit(EACH),
    // the Money list's own search: description, who, and note
    supabase
      .rpc("money_list", { p_q: q })
      .select("id, occurred_at, amount::text, direction, description, counterparty")
      .order("occurred_at", { ascending: false })
      .limit(EACH),
  ]);
  const groups: FoundGroup[] = [
    {
      name: "Customers",
      items: (customers.data ?? []).map((c) => ({
        label: c.name,
        sub: c.is_active ? "Customer" : "Customer · no longer active",
        href: `/customers/${c.id}`,
      })),
    },
    {
      name: "Bills",
      items: (bills.data ?? []).map((b) => ({
        label: b.number,
        sub: `${b.customers.name} · ${formatRupiah(BigInt(b.amount_due))} · ${INVOICE_STATUS[b.status]?.label ?? b.status}`,
        href: `/customers/${b.customer_id}#bill-${b.id}`,
      })),
    },
    {
      name: "Transactions",
      items: (transactions.data ?? []).map((t) => ({
        label: t.counterparty || t.description,
        sub: `${day.format(new Date(t.occurred_at))} · ${t.direction === "in" ? "+" : "−"}${formatRupiah(BigInt(t.amount))}`,
        href: `/money/${t.id}`,
      })),
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}
