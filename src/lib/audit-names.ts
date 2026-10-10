// Readable names for every id in some audit_log rows: the records themselves and anything they
// point to (category, customer, bill...). Shared by the change history screen and the audit
// extract report. Read with the person's own permissions.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Names } from "./audit-describe";
import type { Database } from "./database.types";

// Which column names a row, for the tables whose ids can show up in the log.
const NAME_COLUMN: Record<string, string> = {
  users: "name",
  categories: "name",
  rules: "pattern",
  customers: "name",
  subscriptions: "plan_name",
  invoices: "number",
  recurring_expenses: "name",
  bank_transactions: "description_raw",
};

const REFERS_TO: Record<string, string> = {
  category_id: "categories",
  customer_id: "customers",
  invoice_id: "invoices",
  subscription_id: "subscriptions",
  bank_transaction_id: "bank_transactions",
  bank_account_id: "bank_accounts",
};

type Row = { table_name: string; record_id: string | null; old_value: unknown; new_value: unknown };

/** Names for the rows' ids (people included), and which transaction each entry belongs to. */
export async function auditNames(supabase: SupabaseClient<Database>, rows: Row[]) {
  const wanted = new Map<string, Set<string>>();
  const want = (t: string, id: unknown) => {
    if (typeof id !== "string") return;
    if (!wanted.has(t)) wanted.set(t, new Set());
    wanted.get(t)!.add(id);
  };
  for (const r of rows) {
    if (r.record_id) want(r.table_name, r.record_id);
    for (const v of [r.old_value, r.new_value]) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const [field, target] of Object.entries(REFERS_TO)) {
        want(target, (v as Record<string, unknown>)[field]);
      }
    }
  }

  const { data: people } = await supabase.from("users").select("id, name");
  const names: Names = new Map((people ?? []).map((p) => [p.id, p.name]));
  const entryTransaction = new Map<string, string>();
  await Promise.all([
    ...[...wanted].map(async ([t, ids]) => {
      const column = NAME_COLUMN[t];
      if (!column) return;
      const { data } = await supabase
        .from(t as "users")
        .select(`id, ${column}`)
        .in("id", [...ids]);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) {
        names.set(row.id, row[column]);
      }
    }),
    (async () => {
      const ids = [...(wanted.get("bank_accounts") ?? [])];
      if (!ids.length) return;
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_last4")
        .in("id", ids);
      for (const a of data ?? []) names.set(a.id, `${a.bank_name} ••${a.account_last4}`);
    })(),
    (async () => {
      const ids = [...(wanted.get("entries") ?? [])];
      if (!ids.length) return;
      const { data } = await supabase
        .from("entries")
        .select("id, bank_transaction_id, bank_transactions (description_raw)")
        .in("id", ids);
      for (const e of data ?? []) {
        names.set(e.id, e.bank_transactions.description_raw);
        entryTransaction.set(e.id, e.bank_transaction_id);
      }
    })(),
  ]);
  return { names, entryTransaction };
}
