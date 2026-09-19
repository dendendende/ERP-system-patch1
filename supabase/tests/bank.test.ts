import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

async function createAccount(db: Client) {
  const { rows } = await db.query(
    `insert into bank_accounts (bank_name, account_name, account_last4, source)
     values ('BCA', 'Test', '0001', 'csv') returning id`,
  );
  return rows[0].id as string;
}

const INSERT_TX = `insert into bank_transactions
  (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
  values ($1, $2, '2026-09-01T10:00:00+07', $3, 'in', 'TRSF E-BANKING')`;

// Same as INSERT_TX, but the way sync/import must write: duplicates are skipped, not errors.
const UPSERT_TX = INSERT_TX + " on conflict (bank_account_id, external_id) do nothing";

describe("bank_transactions", () => {
  it("rejects a duplicate external_id on the same account", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      await db.query(INSERT_TX, [acc, "tx-1", 12_000_284]);
      expect((await tryQuery(db, INSERT_TX, [acc, "tx-1", 12_000_284])).error).toMatch(/unique/);
    });
  });

  it("allows the same external_id on a different account", async () => {
    await withRollback(async (db) => {
      const a = await createAccount(db);
      const b = await createAccount(db);
      await db.query(INSERT_TX, [a, "tx-1", 1]);
      expect((await tryQuery(db, INSERT_TX, [b, "tx-1", 1])).error).toBeNull();
    });
  });

  it("re-syncing with ON CONFLICT DO NOTHING creates zero new rows", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      for (let run = 0; run < 3; run++) {
        for (const id of ["tx-1", "tx-2", "tx-3"]) await db.query(UPSERT_TX, [acc, id, 50_000]);
      }
      const { rows } = await db.query(
        "select count(*)::int as n from bank_transactions where bank_account_id = $1",
        [acc],
      );
      expect(rows[0].n).toBe(3);
    });
  });

  it("stores amounts beyond 2^53 exactly and rejects zero or negative amounts", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      await db.query(INSERT_TX, [acc, "big", "9007199254740993"]);
      const { rows } = await db.query(
        "select amount::text from bank_transactions where external_id = 'big'",
      );
      expect(rows[0].amount).toBe("9007199254740993");
      expect((await tryQuery(db, INSERT_TX, [acc, "zero", 0])).error).toMatch(/check/);
      expect((await tryQuery(db, INSERT_TX, [acc, "neg", -5])).error).toMatch(/check/);
    });
  });

  it("rows can't be changed or deleted — not even by the database owner", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      await db.query(INSERT_TX, [acc, "tx-1", 1_000]);
      for (const sql of [
        "update bank_transactions set amount = 1",
        "delete from bank_transactions",
        "truncate bank_transactions",
      ]) {
        expect((await tryQuery(db, sql)).error).toMatch(/insert-only|referenced in a foreign key/);
      }
    });
  });

  it("app users (even the owner) have no update/delete privilege", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      await db.query(INSERT_TX, [acc, "tx-1", 1_000]);
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      for (const sql of [
        "update bank_transactions set amount = 1",
        "delete from bank_transactions",
      ]) {
        expect((await tryQuery(db, sql)).error).toMatch(/permission denied/);
      }
    });
  });

  it("owner and operator can import; a viewer cannot", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      for (const [role, allowed] of [
        ["owner", true],
        ["operator", true],
        ["viewer", false],
      ] as const) {
        await actAsAdmin(db);
        const user = await createUser(db, role);
        await actAs(db, user);
        const res = await tryQuery(db, INSERT_TX, [acc, `tx-${role}`, 1_000]);
        expect(res.error === null, role).toBe(allowed);
      }
    });
  });

  it("is invisible without 2FA", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      await db.query(INSERT_TX, [acc, "tx-1", 1_000]);
      const viewer = await createUser(db, "viewer");
      await actAs(db, viewer, "aal1");
      expect((await db.query("select count(*)::int as n from bank_transactions")).rows[0].n).toBe(
        0,
      );
    });
  });
});

describe("bank_accounts", () => {
  it("only the owner can add or change accounts; changes are audited", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      const operator = await createUser(db, "operator");
      await actAs(db, operator);
      expect((await tryQuery(db, "update bank_accounts set is_active = false")).rowCount).toBe(0);

      await actAsAdmin(db);
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      await db.query("update bank_accounts set is_active = false where id = $1", [acc]);

      await actAsAdmin(db);
      const { rows } = await db.query(
        "select actor_id, old_value, new_value from audit_log where record_id = $1 and action = 'update'",
        [acc],
      );
      expect(rows).toEqual([
        { actor_id: owner, old_value: { is_active: true }, new_value: { is_active: false } },
      ]);
    });
  });

  it("an account with transactions cannot be deleted", async () => {
    await withRollback(async (db) => {
      const acc = await createAccount(db);
      await db.query(INSERT_TX, [acc, "tx-1", 1_000]);
      expect((await tryQuery(db, "delete from bank_accounts where id = $1", [acc])).error).toMatch(
        /foreign key/,
      );
    });
  });
});
