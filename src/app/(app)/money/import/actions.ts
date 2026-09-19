"use server";

import { revalidatePath } from "next/cache";
import { parseTemplateCsv, type RowError } from "@/lib/bank/csv-import";
import { createClient } from "@/lib/supabase/server";

export type ImportState = {
  error?: string;
  preview?: {
    fileName: string;
    total: number;
    fresh: number;
    duplicates: number;
    errors: RowError[];
  };
  imported?: number;
};

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
  const preview = {
    fileName: file.name,
    total: transactions.length,
    fresh: fresh.length,
    duplicates: transactions.length - fresh.length,
    errors,
  };

  // A statement with unreadable rows is never imported partly — missing money is worse than none.
  if (mode === "preview" || errors.length > 0 || fresh.length === 0) return { preview };

  // One request = one statement = all rows or none. ON CONFLICT DO NOTHING keeps it idempotent
  // if two people import the same file at once.
  const { error } = await supabase.from("bank_transactions").upsert(
    fresh.map((t) => ({
      bank_account_id: account.id,
      external_id: t.externalId,
      occurred_at: t.occurredAt,
      // bigint travels as a string so amounts above 2^53 stay exact; Postgres casts it.
      amount: t.amount.toString() as unknown as number,
      direction: t.direction,
      description_raw: t.description,
      balance_after: (t.balanceAfter?.toString() ?? null) as unknown as number | null,
    })),
    { onConflict: "bank_account_id,external_id", ignoreDuplicates: true },
  );
  if (error) {
    return {
      preview,
      error:
        error.code === "42501"
          ? "You don't have permission to import."
          : "Import failed. Nothing was saved.",
    };
  }

  revalidatePath("/money");
  return { imported: fresh.length };
}
