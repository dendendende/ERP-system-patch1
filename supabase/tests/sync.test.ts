import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { MockAdapter } from "@/lib/bank/mock-adapter";
import { runSync, type BatchRow } from "@/lib/bank/sync";
import { actAs, createUser, tryQuery, withRollback } from "./db";

async function createAccount(db: Client) {
  const { rows } = await db.query(
    `insert into bank_accounts (bank_name, account_name, account_last4, source)
     values ('Mandiri', 'Test', '0002', 'aggregator') returning id, bank_name, account_last4, last_synced_at`,
  );
  return rows[0];
}

/** The real save path, called the way the cron route calls it (as service_role). */
const applyVia = (db: Client) => async (accountId: string, rows: BatchRow[], syncedAt: Date) => {
  await db.query("savepoint batch");
  await db.query("set local role service_role");
  try {
    const { rows: r } = await db.query("select sync_bank_batch($1, $2, $3) as n", [
      accountId,
      JSON.stringify(rows),
      syncedAt.toISOString(),
    ]);
    await db.query("release savepoint batch");
    return r[0].n as number;
  } catch (e) {
    await db.query("rollback to savepoint batch");
    throw e;
  } finally {
    await db.query("reset role");
  }
};

const countTx = async (db: Client, accountId: string) =>
  (
    await db.query("select count(*)::int as n from bank_transactions where bank_account_id = $1", [
      accountId,
    ])
  ).rows[0].n as number;

describe("sync job end to end (mock adapter → sync_bank_batch)", () => {
  it("running the job repeatedly produces no duplicates", async () => {
    await withRollback(async (db) => {
      const account = await createAccount(db);
      const now = new Date("2026-09-15T12:00:00+07:00");
      const adapter = new MockAdapter(() => now);

      const [first] = await runSync({
        accounts: [account],
        adapter,
        applyBatch: applyVia(db),
        now,
      });
      expect(first).toMatchObject({ ok: true });
      const afterFirst = await countTx(db, account.id);
      expect(afterFirst).toBeGreaterThan(10);

      for (let i = 0; i < 3; i++) {
        const [again] = await runSync({
          accounts: [account],
          adapter,
          applyBatch: applyVia(db),
          now,
        });
        expect(again).toMatchObject({ ok: true, inserted: 0 });
      }
      expect(await countTx(db, account.id)).toBe(afterFirst);

      const { rows } = await db.query("select last_synced_at from bank_accounts where id = $1", [
        account.id,
      ]);
      expect(rows[0].last_synced_at.toISOString()).toBe(now.toISOString());
    });
  });

  it("a batch with one bad row saves nothing and leaves last_synced_at alone", async () => {
    await withRollback(async (db) => {
      const account = await createAccount(db);
      const good: BatchRow = {
        external_id: "a",
        occurred_at: "2026-09-01T09:00:00+07:00",
        amount: "1000",
        direction: "in",
        description_raw: "OK",
        balance_after: null,
      };
      const bad = { ...good, external_id: "b", amount: "0" }; // violates amount > 0
      await expect(applyVia(db)(account.id, [good, bad], new Date())).rejects.toThrow(/check/);

      expect(await countTx(db, account.id)).toBe(0);
      const { rows } = await db.query("select last_synced_at from bank_accounts where id = $1", [
        account.id,
      ]);
      expect(rows[0].last_synced_at).toBeNull();
    });
  });

  it("refuses inactive accounts", async () => {
    await withRollback(async (db) => {
      const account = await createAccount(db);
      await db.query("update bank_accounts set is_active = false where id = $1", [account.id]);
      await expect(applyVia(db)(account.id, [], new Date())).rejects.toThrow(/inactive/);
    });
  });

  it("stamping last_synced_at is not audited; real account changes still are", async () => {
    await withRollback(async (db) => {
      const account = await createAccount(db);
      await applyVia(db)(account.id, [], new Date());
      await db.query("update bank_accounts set account_name = 'Renamed' where id = $1", [
        account.id,
      ]);
      const { rows } = await db.query(
        "select new_value from audit_log where record_id = $1 and action = 'update'",
        [account.id],
      );
      expect(rows).toEqual([{ new_value: { account_name: "Renamed" } }]);
    });
  });

  it("app users cannot call the sync function", async () => {
    await withRollback(async (db) => {
      const account = await createAccount(db);
      await actAs(db, await createUser(db, "owner"));
      const res = await tryQuery(db, "select sync_bank_batch($1, '[]', now())", [account.id]);
      expect(res.error).toMatch(/permission denied/);
    });
  });
});
