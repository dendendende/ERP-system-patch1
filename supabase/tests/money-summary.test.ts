import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, createUser, withRulesOff } from "./db";

let seq = 0;

async function account(db: Client, name: string) {
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ($1, 'T', '0016', 'csv') returning id",
      [name],
    )
  ).rows[0].id as string;
}

async function tx(
  db: Client,
  acct: string,
  day: string,
  direction: "in" | "out",
  amount: number,
  opts: { balance?: number; recurring?: boolean } = {},
) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw, balance_after)
     values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, $5, 'X', $6) returning id`,
    [acct, `sum-${++seq}`, day, amount, direction, opts.balance ?? null],
  );
  if (opts.recurring)
    await db.query("update entries set is_recurring = true where bank_transaction_id = $1", [rows[0].id]);
  return rows[0].id as string;
}

const M = 1_000_000;

describe("money_summary on a fixed dataset (hand-calculated)", () => {
  it("adds up exactly what the plan says", async () => {
    await withRulesOff(async (db) => {
      // only this test's accounts and bills count
      await db.query("update bank_accounts set is_active = false");
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'test' where status in ('open', 'partly_paid')",
      );
      const a = await account(db, "A");
      const b = await account(db, "B");
      await account(db, "C (no balances)");

      // three full months before May 2031: rent each month (recurring), one big one-off
      for (const m of ["02", "03", "04"]) await tx(db, a, `2031-${m}-10`, "out", 3 * M, { recurring: true });
      await tx(db, a, "2031-04-20", "out", 30 * M); // laptop: not recurring
      await tx(db, a, "2031-02-15", "in", 9 * M);
      await tx(db, a, "2031-03-15", "in", 12 * M);
      await tx(db, a, "2031-04-15", "in", 6 * M, { balance: 40 * M });
      await tx(db, a, "2031-01-31", "out", 999); // before the window

      // May 2031, up to the 15th
      await tx(db, a, "2031-05-02", "in", 5 * M);
      await tx(db, a, "2031-05-03", "out", 1 * M);
      await tx(db, a, "2031-05-05", "out", 2 * M, { balance: 50 * M }); // moved to our own account B…
      await tx(db, b, "2031-05-05", "in", 2 * M, { balance: 20 * M }); // …so neither side counts
      await tx(db, a, "2031-05-20", "in", 7 * M, { balance: 57 * M }); // after "today": not even its balance

      // bills: one past due and partly paid, one not yet due
      await db.query("set local role service_role");
      const late = (
        await db.query("select id from create_invoice((select id from customers limit 1), $1, '2031-04-01', '2031-05-01')", [4 * M])
      ).rows[0].id;
      await db.query("select id from create_invoice((select id from customers limit 1), $1, '2031-05-01', '2031-06-01')", [6 * M]);
      await db.query("reset role");
      const pay = await tx(db, a, "2031-04-25", "in", 1 * M);
      await actAs(db, await createUser(db, "operator"));
      await db.query("select apply_payment($1, $2, $3)", [late, pay, 1 * M]);

      const { rows } = await db.query("select * from money_summary('2031-05-15')");
      expect(rows[0]).toEqual({
        cash_in_bank: String(70 * M), // A's latest 50 jt + B's 20 jt
        accounts_without_balance: 1, // C
        came_in: String(5 * M), // the 2 jt from our own account doesn't count
        went_out: String(1 * M), // nor the 2 jt we moved
        usual_came_in: String((9 + 12 + 6 + 1) * M / 3 | 0), // Feb–Apr, incl. the 1 jt payment in April
        usual_went_out: String((3 + 3 + 3 + 30) * M / 3), // 13 jt
        recurring_spending: String(3 * M), // rent only; the laptop is left out
        still_owed: String((3 + 6) * M), // 4 jt − 1 jt paid, + 6 jt
        past_due: String(3 * M),
      });
    });
  });
});

describe("monthly_in_out", () => {
  it("six months, empty ones included, own transfers left out, nothing after today", async () => {
    await withRulesOff(async (db) => {
      await db.query("update bank_accounts set is_active = false");
      const a = await account(db, "A");
      const b = await account(db, "B");
      await tx(db, a, "2031-01-20", "in", 9 * M); // before the window
      await tx(db, a, "2031-02-10", "in", 4 * M);
      await tx(db, a, "2031-04-10", "out", 1 * M);
      await tx(db, a, "2031-07-01", "in", 2 * M);
      await tx(db, a, "2031-07-02", "out", 5 * M); // to our own account B…
      await tx(db, b, "2031-07-02", "in", 5 * M); // …so it doesn't count either way
      await tx(db, a, "2031-07-20", "in", 8 * M); // after "today"

      const { rows } = await db.query(
        "select month::text, came_in::text, went_out::text from monthly_in_out(6, '2031-07-15')",
      );
      expect(rows).toEqual([
        { month: "2031-02-01", came_in: String(4 * M), went_out: "0" },
        { month: "2031-03-01", came_in: "0", went_out: "0" },
        { month: "2031-04-01", came_in: "0", went_out: String(1 * M) },
        { month: "2031-05-01", came_in: "0", went_out: "0" },
        { month: "2031-06-01", came_in: "0", went_out: "0" },
        { month: "2031-07-01", came_in: String(2 * M), went_out: "0" },
      ]);
    });
  });
});

describe("came_in_went_out", () => {
  it("adds up a range of days, both ends included, own transfers left out", async () => {
    await withRulesOff(async (db) => {
      await db.query("update bank_accounts set is_active = false");
      const a = await account(db, "A");
      const b = await account(db, "B");
      await tx(db, a, "2031-09-21", "in", 3 * M); // Monday
      await tx(db, a, "2031-09-27", "out", 1 * M); // Sunday
      await tx(db, a, "2031-09-28", "in", 9 * M); // next Monday: outside
      await tx(db, a, "2031-09-24", "out", 4 * M); // to our own account…
      await tx(db, b, "2031-09-24", "in", 4 * M); // …not counted
      const { rows } = await db.query(
        "select came_in::text, went_out::text from came_in_went_out('2031-09-21', '2031-09-27')",
      );
      expect(rows[0]).toEqual({ came_in: String(3 * M), went_out: String(1 * M) });
    });
  });
});
