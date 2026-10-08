import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, createUser, tryQuery, withRulesOff } from "./db";

let seq = 0;

async function account(db: Client) {
  await db.query("update bank_accounts set is_active = false");
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA', 'T', '0017', 'csv') returning id",
    )
  ).rows[0].id as string;
}

async function row(db: Client, acct: string, day: string, direction: "in" | "out", amount: number, balance?: number, description = "TRSF") {
  await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw, balance_after)
     values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz + make_interval(secs => $7), $4, $5, $6, $8)`,
    [acct, `bal-${++seq}`, day, amount, direction, description, seq, balance ?? null],
  );
}

async function check(db: Client) {
  await db.query("set local role service_role");
  const { rows } = await db.query(
    "select expected::text, actual::text, difference::text, status, likely_cause from check_balances('2031-06-30')",
  );
  await db.query("reset role");
  return rows[0];
}

describe("daily balance check", () => {
  it("everything adds up → ok", async () => {
    await withRulesOff(async (db) => {
      const a = await account(db);
      await row(db, a, "2031-06-01", "in", 100, 1100);
      await row(db, a, "2031-06-02", "out", 30); // no balance on this one
      await row(db, a, "2031-06-03", "in", 50, 1120);
      expect(await check(db)).toEqual({
        expected: "1120",
        actual: "1120",
        difference: "0",
        status: "ok",
        likely_cause: null,
      });
    });
  });

  it("money typed in by hand isn't the bank's: it never makes the balance disagree", async () => {
    await withRulesOff(async (db) => {
      const a = await account(db);
      await row(db, a, "2031-06-01", "in", 100, 1100);
      await db.query(
        `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, entered_by)
         values ($1, 'hand:' || gen_random_uuid(), '2031-06-02T10:00:00+07', 999, 'out',
                 (select id from users limit 1))`,
        [a],
      );
      await row(db, a, "2031-06-03", "in", 50, 1150);
      expect((await check(db)).status).toBe("ok");
    });
  });

  it("a transfer we never received → mismatch, with when it happened", async () => {
    await withRulesOff(async (db) => {
      const a = await account(db);
      await row(db, a, "2031-06-01", "in", 100, 1100);
      // the bank paid out 30 on 2 June; our sync missed it
      await row(db, a, "2031-06-05", "in", 50, 1120);
      expect(await check(db)).toEqual({
        expected: "1150",
        actual: "1120",
        difference: "-30",
        status: "mismatch",
        likely_cause:
          "The bank shows money moving between 01 Jun 2031 and 05 Jun 2031 that we never received — some days are missing",
      });
    });
  });

  it("a row we have twice → mismatch, naming the duplicate", async () => {
    await withRulesOff(async (db) => {
      const a = await account(db);
      await row(db, a, "2031-06-01", "in", 100, 1100);
      await row(db, a, "2031-06-02", "in", 40_000, undefined, "TRSF PT MAJU");
      await row(db, a, "2031-06-02", "in", 40_000, undefined, "TRSF PT MAJU"); // imported twice
      await row(db, a, "2031-06-03", "out", 10, 41_090);
      expect(await check(db)).toMatchObject({
        difference: "-40000",
        status: "mismatch",
        likely_cause: "A payment in of Rp 40.000 on 02 Jun 2031 appears twice — one may be a duplicate",
      });
    });
  });

  it("no balance from the bank → no_data; running it again the same day updates, never duplicates", async () => {
    await withRulesOff(async (db) => {
      const a = await account(db);
      await row(db, a, "2031-06-01", "in", 100);
      expect(await check(db)).toMatchObject({ status: "no_data" });
      await row(db, a, "2031-06-02", "in", 5, 1105);
      expect(await check(db)).toMatchObject({ status: "ok" });
      const { rows } = await db.query("select count(*)::int as n from balance_checks where bank_account_id = $1", [a]);
      expect(rows[0].n).toBe(1);
    });
  });

  it("only the job runs it", async () => {
    await withRulesOff(async (db) => {
      await actAs(db, await createUser(db, "owner"));
      expect((await tryQuery(db, "select check_balances()")).error).toMatch(/permission denied/);
    });
  });
});
