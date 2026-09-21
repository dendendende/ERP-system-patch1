import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

// Dates in 2031 so committed demo data (mock bank, e2e imports) can never be the counterpart.
let seq = 0;

async function account(db: Client) {
  const { rows } = await db.query(
    `insert into bank_accounts (bank_name, account_name, account_last4, source)
     values ('BCA', 'Test', '0005', 'csv') returning id`,
  );
  return rows[0].id as string;
}

/** Inserts a transaction; returns its id. */
async function tx(
  db: Client,
  acc: string,
  direction: "in" | "out",
  amount: number,
  at: string,
  description = "TRF",
) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [acc, `tr-${++seq}`, at, amount, direction, description],
  );
  return rows[0].id as string;
}

async function label(db: Client, txId: string) {
  const { rows } = await db.query(
    `select e.status, c.name, c.type from entries e left join categories c on c.id = e.category_id
      where e.bank_transaction_id = $1`,
    [txId],
  );
  return rows[0];
}

const TRANSFER = "Transfer between own accounts";

describe("own-transfer detection", () => {
  it("out on one account + same amount in on another, next day → both are transfers", async () => {
    await withRulesOff(async (db) => {
      const [a, b] = [await account(db), await account(db)];
      const out = await tx(db, a, "out", 45_000_000, "2031-03-24T16:00:00+07:00");
      const inn = await tx(db, b, "in", 45_000_000, "2031-03-25T09:00:00+07:00");
      expect(await label(db, out)).toEqual({ status: "auto", name: TRANSFER, type: "out" });
      expect(await label(db, inn)).toEqual({ status: "auto", name: TRANSFER, type: "in" });
    });
  });

  it("uses Jakarta dates: 23:30 and 00:30 WIB are one day apart even across UTC midnight", async () => {
    await withRulesOff(async (db) => {
      const [a, b] = [await account(db), await account(db)];
      const out = await tx(db, a, "out", 1_000_001, "2031-03-01T23:30:00+07:00");
      await tx(db, b, "in", 1_000_001, "2031-03-02T00:30:00+07:00");
      expect((await label(db, out)).name).toBe(TRANSFER);
    });
  });

  it("is not a transfer when the account, amount, direction or timing doesn't fit", async () => {
    await withRulesOff(async (db) => {
      const [a, b] = [await account(db), await account(db)];
      const same = await tx(db, a, "out", 500_000, "2031-03-01T09:00:00+07:00");
      await tx(db, a, "in", 500_000, "2031-03-01T10:00:00+07:00"); // same account (a refund)
      const diffAmount = await tx(db, a, "out", 600_000, "2031-03-01T09:00:00+07:00");
      await tx(db, b, "in", 600_001, "2031-03-01T10:00:00+07:00");
      const tooLate = await tx(db, a, "out", 700_000, "2031-03-01T09:00:00+07:00");
      await tx(db, b, "in", 700_000, "2031-03-03T09:00:00+07:00"); // two days later
      const bothOut = await tx(db, a, "out", 800_000, "2031-03-01T09:00:00+07:00");
      await tx(db, b, "out", 800_000, "2031-03-01T09:00:00+07:00");
      for (const t of [same, diffAmount, tooLate, bothOut]) {
        expect((await label(db, t)).name).not.toBe(TRANSFER);
      }
    });
  });

  it("pairs each transaction only once", async () => {
    await withRulesOff(async (db) => {
      const [a, b, c] = [await account(db), await account(db), await account(db)];
      await tx(db, a, "out", 2_000_000, "2031-03-01T09:00:00+07:00");
      const first = await tx(db, b, "in", 2_000_000, "2031-03-01T09:05:00+07:00");
      const second = await tx(db, c, "in", 2_000_000, "2031-03-01T09:10:00+07:00");
      expect((await label(db, first)).name).toBe(TRANSFER);
      expect((await label(db, second)).name).not.toBe(TRANSFER);
    });
  });

  it("beats a rule, but never overrides a label a person set", async () => {
    await withRulesOff(async (db) => {
      const [a, b] = [await account(db), await account(db)];
      const salary = (await db.query("select id from categories where name = 'Salary'")).rows[0].id;
      await db.query(
        "insert into rules (match_type, pattern, direction, category_id) values ('contains', 'PAYROLL', 'out', $1)",
        [salary],
      );
      const out = await tx(db, a, "out", 45_000_000, "2031-03-25T09:00:00+07:00", "TRF KE PAYROLL");
      expect((await label(db, out)).name).toBe("Salary"); // no counterpart yet: rule applies
      await tx(db, b, "in", 45_000_000, "2031-03-25T09:30:00+07:00");
      expect((await label(db, out)).name).toBe(TRANSFER); // counterpart arrived: transfer wins

      const manual = await tx(db, a, "out", 3_000_000, "2031-03-26T09:00:00+07:00");
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      await db.query(
        "update entries set category_id = (select id from categories where name = 'Equipment') where bank_transaction_id = $1",
        [manual],
      );
      await actAsAdmin(db);
      const inn = await tx(db, b, "in", 3_000_000, "2031-03-26T10:00:00+07:00");
      expect(await label(db, manual)).toMatchObject({ status: "labelled", name: "Equipment" });
      expect((await label(db, inn)).name).not.toBe(TRANSFER);
    });
  });
});
