import { describe, expect, it, vi } from "vitest";
import type { BankSourceAdapter } from "./adapter";
import { MockAdapter } from "./mock-adapter";
import { runSync, syncSince, withRetry } from "./sync";

const noSleep = { baseMs: 1, sleep: async () => {} };
const account = (id: string, last_synced_at: string | null = null) => ({
  id,
  bank_name: "Mandiri",
  account_last4: "0002",
  last_synced_at,
});

describe("withRetry", () => {
  it("retries with exponential backoff, then succeeds", async () => {
    const sleeps: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("503"))
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValue("ok");
    await expect(
      withRetry(fn, { baseMs: 500, sleep: async (ms) => void sleeps.push(ms) }),
    ).resolves.toBe("ok");
    expect(sleeps).toEqual([500, 1000]);
  });

  it("gives up after the last attempt", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    await expect(withRetry(fn, { attempts: 3, ...noSleep })).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("runSync", () => {
  it("one failing account does not stop the others", async () => {
    const adapter: BankSourceAdapter = {
      fetchTransactions: async (a) => {
        if (a.id === "broken") throw new Error("aggregator timeout");
        return [];
      },
      fetchBalance: async () => 0n,
    };
    const log = vi.fn();
    const results = await runSync({
      accounts: [account("broken"), account("fine")],
      adapter,
      applyBatch: async () => 0,
      retry: noSleep,
      log,
    });
    expect(results).toEqual([
      { accountId: "broken", ok: false, error: "aggregator timeout" },
      { accountId: "fine", ok: true, fetched: 0, inserted: 0 },
    ]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("aggregator timeout"));
  });

  it("re-reads a 3-day overlap after the last sync, 30 days on the first sync", () => {
    const now = new Date("2026-09-15T00:00:00Z");
    expect(syncSince(account("a", "2026-09-10T00:00:00Z"), now).toISOString()).toBe(
      "2026-09-07T00:00:00.000Z",
    );
    expect(syncSince(account("a"), now).toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });
});

describe("MockAdapter", () => {
  const now = new Date("2026-09-15T12:00:00+07:00");
  const ref = { id: "acc-1", bank_name: "Mandiri", account_last4: "0002" };

  it("is deterministic: same ids and amounts on every read", async () => {
    const a = new MockAdapter(() => now);
    const since = new Date("2026-09-01T00:00:00+07:00");
    expect(await a.fetchTransactions(ref, since)).toEqual(await a.fetchTransactions(ref, since));
  });

  it("balance_after is a consistent running balance that ends at fetchBalance()", async () => {
    const a = new MockAdapter(() => now);
    const txs = await a.fetchTransactions(ref, new Date("2026-01-01T00:00:00+07:00"));
    for (let i = 1; i < txs.length; i++) {
      const delta = txs[i].direction === "in" ? txs[i].amount : -txs[i].amount;
      expect(txs[i].balanceAfter).toBe(txs[i - 1].balanceAfter! + delta);
    }
    expect(txs.at(-1)!.balanceAfter).toBe(await a.fetchBalance(ref));
  });

  it("never returns future transactions", async () => {
    const a = new MockAdapter(() => now);
    const txs = await a.fetchTransactions(ref, new Date("2026-09-01T00:00:00+07:00"));
    expect(txs.every((t) => Date.parse(t.occurredAt) <= now.getTime())).toBe(true);
    expect(txs.every((t) => t.amount > 0n)).toBe(true);
  });
});
