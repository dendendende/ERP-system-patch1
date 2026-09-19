import type { ParsedTx } from "./csv-import";

export type BankTx = ParsedTx;
export type BankAccountRef = { id: string; bank_name: string; account_last4: string };

/** A read-only source of bank data (aggregator API, or the mock). Never moves money. */
export interface BankSourceAdapter {
  /** Transactions on or after `since`. Must return the same externalId for the same transaction. */
  fetchTransactions(account: BankAccountRef, since: Date): Promise<BankTx[]>;
  /** Current balance, whole rupiah. */
  fetchBalance(account: BankAccountRef): Promise<bigint>;
}

/** YYYY-MM-DD of `date` in Asia/Jakarta. */
export function jakartaDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}
