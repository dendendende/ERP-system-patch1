import type { BankSourceAdapter } from "@/lib/bank/adapter";
import { MockAdapter } from "@/lib/bank/mock-adapter";
import { runSync } from "@/lib/bank/sync";
import { authorized } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function adapterFromEnv(): BankSourceAdapter | null {
  switch (process.env.BANK_ADAPTER) {
    case "mock":
      // Fake transactions must never reach the production database.
      if (process.env.VERCEL_ENV === "production")
        throw new Error("BANK_ADAPTER=mock in production");
      return new MockAdapter();
    default:
      return null; // P1-T4 adds the real aggregator
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const adapter = adapterFromEnv();
  if (!adapter) return Response.json({ skipped: "BANK_ADAPTER not set" });

  const db = createAdminClient();
  const { data: accounts, error } = await db
    .from("bank_accounts")
    .select("id, bank_name, account_last4, last_synced_at")
    .eq("source", "aggregator")
    .eq("is_active", true);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = await runSync({
    accounts,
    adapter,
    applyBatch: async (accountId, rows, syncedAt) => {
      const { data, error } = await db.rpc("sync_bank_batch", {
        p_account_id: accountId,
        p_rows: rows,
        p_synced_at: syncedAt.toISOString(),
      });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  // Which invoices did the new money pay? Also picks up anything a failed run left behind.
  const { data: matched, error: matchError } = await db.rpc("match_payments");
  if (matchError) console.error(`payment matching failed: ${matchError.message}`);

  // Does our copy add up to the bank's balances? One row per account per day, updated each run.
  const { error: checkError } = await db.rpc("check_balances", {});
  if (checkError) console.error(`balance check failed: ${checkError.message}`);

  // Non-200 when anything failed, so cron monitoring flags it.
  const ok = results.every((r) => r.ok) && !matchError;
  return Response.json({ results, matched }, { status: ok ? 200 : 500 });
}
