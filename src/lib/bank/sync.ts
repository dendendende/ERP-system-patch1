// Sync job: for each account, fetch → save the batch atomically (sync_bank_batch) → next.
// Safe to run any number of times: the save skips known external_ids.
import type { BankAccountRef, BankSourceAdapter } from "./adapter";
import type { BankTx } from "./csv-import";

const DAY = 86_400_000;
export const FIRST_SYNC_DAYS = 30;
/** Banks post late and back-date; re-read this window every sync. Duplicates are skipped. */
export const OVERLAP_DAYS = 3;

export type SyncAccount = BankAccountRef & { last_synced_at: string | null };
export type ApplyBatch = (accountId: string, rows: BatchRow[], syncedAt: Date) => Promise<number>;
export type SyncResult =
  | { accountId: string; ok: true; fetched: number; inserted: number }
  | { accountId: string; ok: false; error: string };

/** JSON rows for sync_bank_batch. Amounts as strings so bigint survives JSON exactly. */
export type BatchRow = ReturnType<typeof toBatchRows>[number];
export function toBatchRows(txs: BankTx[]) {
  return txs.map((t) => ({
    external_id: t.externalId,
    occurred_at: t.occurredAt,
    amount: t.amount.toString(),
    direction: t.direction,
    description_raw: t.description,
    balance_after: t.balanceAfter?.toString() ?? null,
  }));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 500 } = {},
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** (i - 1))); // 500ms, 1s, 2s…
    }
  }
}

export function syncSince(account: SyncAccount, now: Date): Date {
  return account.last_synced_at
    ? new Date(Date.parse(account.last_synced_at) - OVERLAP_DAYS * DAY)
    : new Date(now.getTime() - FIRST_SYNC_DAYS * DAY);
}

export async function runSync({
  accounts,
  adapter,
  applyBatch,
  now = new Date(),
  retry,
  log = console.error,
}: {
  accounts: SyncAccount[];
  adapter: BankSourceAdapter;
  applyBatch: ApplyBatch;
  now?: Date;
  retry?: Parameters<typeof withRetry>[1];
  log?: (msg: string) => void;
}): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  // ponytail: accounts run one after another; parallelize if there are ever dozens of accounts
  for (const account of accounts) {
    try {
      const txs = await withRetry(
        () => adapter.fetchTransactions(account, syncSince(account, now)),
        retry,
      );
      const inserted = await withRetry(() => applyBatch(account.id, toBatchRows(txs), now), retry);
      results.push({ accountId: account.id, ok: true, fetched: txs.length, inserted });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      log(`bank sync failed for ${account.bank_name} ••${account.account_last4}: ${error}`);
      results.push({ accountId: account.id, ok: false, error });
    }
  }
  return results;
}
