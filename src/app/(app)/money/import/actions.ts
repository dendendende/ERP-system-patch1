"use server";

import { revalidatePath } from "next/cache";
import { parseTemplateCsv, type RowError } from "@/lib/bank/csv-import";
import { handEntriesInStatement } from "@/lib/bank/hand-duplicates";
import { toBatchRows } from "@/lib/bank/sync";
import type { TablesInsert } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANCELLED_CATEGORY } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type ImportState = {
  error?: string;
  preview?: {
    fileName: string;
    fresh: number;
    duplicates: number;
    errors: RowError[];
    /** Money already entered by hand that this statement seems to bring in again. */
    typedByHand: HandEntry[];
  };
  imported?: number;
  /** What was just imported (the first ones), so details can be added right away. */
  rows?: ImportedRow[];
  typedByHand?: HandEntry[];
};

export type ImportedRow = {
  id: string;
  occurred_at: string;
  amount: string;
  direction: string;
  description_raw: string;
};
type HandEntry = {
  id: string;
  day: string;
  amount: string;
  direction: string;
  description: string;
};

const jakartaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
const DETAIL_ROWS = 100;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;
const LOOKUP_CHUNK = 200; // external_ids per duplicate lookup (keeps the request URL short)

export async function importStatement(_prev: ImportState, form: FormData): Promise<ImportState> {
  const accountId = String(form.get("accountId") ?? "");
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";

  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first." };
  if (file.size > MAX_BYTES)
    return { error: "That file is too big (max 5 MB). Split it by month." };

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle();
  if (!account) return { error: "Choose which bank account this statement is from." };

  const { transactions, errors } = parseTemplateCsv(account.id, await file.text());
  if (transactions.length > MAX_ROWS) return { error: `Too many rows (max ${MAX_ROWS}).` };

  const existing = new Set<string>();
  for (let i = 0; i < transactions.length; i += LOOKUP_CHUNK) {
    const ids = transactions.slice(i, i + LOOKUP_CHUNK).map((t) => t.externalId);
    const { data, error } = await supabase
      .from("bank_transactions")
      .select("external_id")
      .eq("bank_account_id", account.id)
      .in("external_id", ids);
    if (error) return { error: "Couldn't check for duplicates. Try again." };
    for (const row of data) existing.add(row.external_id);
  }
  const fresh = transactions.filter((t) => !existing.has(t.externalId));

  // money entered by hand in the same days, on this account, not cancelled yet
  let typedByHand: HandEntry[] = [];
  if (fresh.length) {
    const days = fresh.map((t) => t.occurredAt.slice(0, 10)).sort();
    const { data: hand } = await supabase
      .from("bank_transactions")
      .select(
        "id, occurred_at, amount::text, direction, description_raw, entries!inner (categories (name))",
      )
      .eq("bank_account_id", account.id)
      .not("entered_by", "is", null)
      .gte("occurred_at", `${days[0]}T00:00:00+07:00`)
      .lt(
        "occurred_at",
        new Date(Date.parse(`${days.at(-1)}T00:00:00+07:00`) + 2 * 86_400_000).toISOString(),
      );
    const open = (hand ?? [])
      .filter((h) => h.entries.categories?.name !== CANCELLED_CATEGORY)
      .map((h) => ({
        id: h.id,
        day: jakartaDay.format(new Date(h.occurred_at)),
        amount: h.amount,
        direction: h.direction,
        description: h.description_raw,
      }));
    typedByHand = handEntriesInStatement(
      fresh.map((t) => ({
        day: t.occurredAt.slice(0, 10),
        amount: t.amount,
        direction: t.direction,
      })),
      open.map((h) => ({ ...h, amount: BigInt(h.amount), direction: h.direction as "in" | "out" })),
    ).map((h) => ({ ...h, amount: h.amount.toString() }));
  }

  const preview = {
    fileName: file.name,
    fresh: fresh.length,
    duplicates: transactions.length - fresh.length,
    errors,
    typedByHand,
  };

  // A statement with unreadable rows is never imported partly — missing money is worse than none.
  if (mode === "preview" || errors.length > 0 || fresh.length === 0) return { preview };

  // One request = one statement = all rows or none. ON CONFLICT DO NOTHING keeps it idempotent
  // if two people import the same file at once.
  const { data: inserted, error } = await supabase
    .from("bank_transactions")
    .upsert(
      // amounts travel as strings so values above 2^53 stay exact; Postgres casts them
      toBatchRows(fresh).map((r) => ({
        ...r,
        bank_account_id: account.id,
      })) as unknown as TablesInsert<"bank_transactions">[],
      { onConflict: "bank_account_id,external_id", ignoreDuplicates: true },
    )
    .select("id, occurred_at, amount::text, direction, description_raw");
  if (error) return { preview, error: "Import failed. Nothing was saved." };

  // Match new money to invoices. Only the engine's identity may record automatic payments; if
  // this fails the import still stands and the next hourly sync matches it.
  const { error: matchError } = await createAdminClient().rpc("match_payments");
  if (matchError) console.error(`payment matching after import failed: ${matchError.message}`);

  revalidatePath("/money");
  const rows = ((inserted ?? []) as ImportedRow[])
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .slice(0, DETAIL_ROWS);
  return { imported: inserted?.length ?? fresh.length, rows, typedByHand };
}

export type DetailsState = { saved?: number; error?: string };

/** Who and what-for for just-imported rows. Only filled-in rows are touched; RLS decides who may. */
export async function saveImportDetails(
  _prev: DetailsState,
  form: FormData,
): Promise<DetailsState> {
  const changes = String(form.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .map((id) => ({
      id,
      counterparty: String(form.get(`who-${id}`) ?? "")
        .trim()
        .slice(0, 200),
      note: String(form.get(`note-${id}`) ?? "")
        .trim()
        .slice(0, 500),
    }))
    .filter((c) => c.counterparty || c.note);
  if (!changes.length) return { error: "Nothing filled in yet." };

  const supabase = await createClient();
  const results = await Promise.all(
    changes.map(({ id, counterparty, note }) =>
      supabase
        .from("entries")
        .update({ counterparty, note })
        .eq("bank_transaction_id", id)
        .select("id"),
    ),
  );
  const saved = results.filter((r) => !r.error && r.data?.length).length;
  revalidatePath("/money");
  return saved === changes.length
    ? { saved }
    : { saved, error: `${changes.length - saved} couldn't be saved. Try again.` };
}
