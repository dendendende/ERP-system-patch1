import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

// Money recorded by hand: marked with who typed it, audited, recorded once per form, never
// changed — and a mistake is cancelled out of every total, which only hand entries allow.

async function account(db: Client) {
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('Hand', 'T', '0042', 'csv') returning id",
    )
  ).rows[0].id as string;
}

const record = (db: Client, key: string, acct: string, extra = "") =>
  db.query(
    `select public.record_by_hand($1, $2, '2001-05-02', 'out', 750000, 'Toko Sinar', 'Printer ink'${extra}) id`,
    [key, acct],
  );

const total = async (db: Client) =>
  (
    await db.query(
      "select public.money_list_summary(p_from => '2001-05-01', p_to => '2001-05-31') s",
    )
  ).rows[0].s;

describe("record_by_hand", () => {
  it("records once per form, marked and audited, with the details; viewers can't", async () => {
    await withRulesOff(async (db) => {
      const acct = await account(db);
      const operator = await createUser(db, "operator");
      const viewer = await createUser(db, "viewer");
      const key = randomUUID();

      await actAs(db, operator);
      const id = (await record(db, key, acct)).rows[0].id;
      // the same form sent twice gives the same transaction, not a second one
      expect((await record(db, key, acct)).rows[0].id).toBe(id);

      const [row] = (
        await db.query(
          "select * from public.money_list(p_from => '2001-05-01', p_to => '2001-05-31')",
        )
      ).rows;
      expect(row).toMatchObject({
        id,
        amount: "750000",
        direction: "out",
        description: "Toko Sinar",
        counterparty: "Toko Sinar",
        note: "Printer ink",
        by_hand: true,
      });
      expect((await total(db)).went_out).toBe("750000");
      // searching the note finds it
      expect(
        (await db.query("select id from public.money_list(p_q => 'printer ink')")).rows,
      ).toEqual([{ id }]);

      await actAsAdmin(db);
      const { rows: tx } = await db.query(
        "select entered_by, external_id from bank_transactions where id = $1",
        [id],
      );
      expect(tx[0]).toEqual({ entered_by: operator, external_id: `hand:${key}` });
      const { rows: audit } = await db.query(
        "select actor_id from audit_log where table_name = 'bank_transactions' and record_id = $1 and action = 'insert'",
        [id],
      );
      expect(audit).toEqual([{ actor_id: operator }]);

      // never changed afterwards, like everything else in bank_transactions
      await actAs(db, operator);
      expect(
        (await tryQuery(db, "update bank_transactions set amount = 1 where id = $1", [id])).error,
      ).not.toBeNull();

      await actAs(db, viewer);
      expect(
        (
          await tryQuery(db, "select public.record_by_hand($1, $2, '2001-05-02', 'in', 5)", [
            randomUUID(),
            acct,
          ])
        ).error,
      ).toMatch(/row-level security/);
      // no future dates
      await actAs(db, operator);
      expect(
        (
          await tryQuery(db, "select public.record_by_hand($1, $2, '2999-01-01', 'in', 5)", [
            randomUUID(),
            acct,
          ])
        ).error,
      ).toMatch(/future/);
    });
  });

  it("a cancelled hand entry stays listed but leaves every total; bank money can't be cancelled", async () => {
    await withRulesOff(async (db) => {
      const acct = await account(db);
      const owner = await createUser(db, "owner");
      const { rows: bank } = await db.query(
        `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
         values ($1, 'by-hand-bank', '2001-05-03T10:00:00+07', 100000, 'out', 'ATM') returning id`,
        [acct],
      );
      const cancelled = (
        await db.query(
          "select id from categories where is_system and type = 'out' and name = 'Cancelled (entered by mistake)'",
        )
      ).rows[0].id;

      await actAs(db, owner);
      const id = (await record(db, randomUUID(), acct)).rows[0].id;
      expect((await total(db)).went_out).toBe("850000");

      await db.query("update entries set category_id = $1 where bank_transaction_id = $2", [
        cancelled,
        id,
      ]);
      expect((await total(db)).went_out).toBe("100000");
      expect((await total(db)).count).toBe(2); // still listed

      const refused = await tryQuery(
        db,
        "update entries set category_id = $1 where bank_transaction_id = $2",
        [cancelled, bank[0].id],
      );
      expect(refused.error).toMatch(/Only money entered by hand/);
      // nor can a rule quietly file bank money as cancelled
      expect(
        (
          await tryQuery(
            db,
            "insert into rules (match_type, pattern, direction, category_id) values ('contains', 'ATM', 'out', $1)",
            [cancelled],
          )
        ).error,
      ).toMatch(/can't file money as cancelled/);
    });
  });
});
