import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

// Money in & out v2: the list and its totals/charts describe exactly the same rows.
let seq = 0;

async function account(db: Client, name: string) {
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ($1, 'T', '0099', 'csv') returning id",
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
  desc = "X",
) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, $5, $6) returning id`,
    [acct, `list-${++seq}`, day, amount, direction, desc],
  );
  return rows[0].id as string;
}

/** Only rows from 2031 (this test's own), so local data never changes the answer. */
const YEAR = { p_from: "2031-01-01", p_to: "2031-12-31" };
const args = (extra: Record<string, unknown> = {}) => {
  const all = { ...YEAR, ...extra };
  const keys = Object.keys(all);
  return {
    sql: keys.map((k, i) => `${k} => $${i + 1}`).join(", "),
    values: keys.map((k) => all[k as keyof typeof all]),
  };
};
const list = async (db: Client, extra?: Record<string, unknown>) => {
  const a = args(extra);
  return (
    await db.query(`select * from public.money_list(${a.sql}) order by occurred_at`, a.values)
  ).rows;
};
const summary = async (db: Client, extra?: Record<string, unknown>) => {
  const a = args(extra);
  return (await db.query(`select public.money_list_summary(${a.sql}) s`, a.values)).rows[0].s;
};

describe("money_list", () => {
  it("filters by Jakarta day, direction, amount, search and status; totals match the rows", async () => {
    await withRulesOff(async (db) => {
      const a = await account(db, "List A");
      const b = await account(db, "List B");
      await tx(db, a, "2031-03-01", "in", 5_000_000, "TRSF CR PT ALPHA");
      await tx(db, a, "2031-03-31", "out", 1_000_000, "AWS");
      await tx(db, a, "2031-04-02", "out", 2_000_000, "OWN MOVE"); // own transfer…
      await tx(db, b, "2031-04-02", "in", 2_000_000, "OWN MOVE"); // …both sides
      // 1 April 00:30 Jakarta is still 31 March in UTC: it belongs to April here
      await db.query(
        `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
         values ($1, 'list-late', '2031-04-01T00:30:00+07', 700000, 'in', 'TRSF CR PT BETA')`,
        [a],
      );

      expect(await list(db)).toHaveLength(5);
      expect(await list(db, { p_to: "2031-03-31" })).toHaveLength(2);
      expect(await list(db, { p_from: "2031-04-01" })).toHaveLength(3);
      expect((await list(db, { p_direction: "out" })).map((r) => r.description)).toEqual([
        "AWS",
        "OWN MOVE",
      ]);
      expect(await list(db, { p_min: 1_000_000, p_max: 2_000_000 })).toHaveLength(3);
      expect((await list(db, { p_q: "pt beta" })).map((r) => r.amount)).toEqual(["700000"]);
      expect(await list(db, { p_account: b })).toHaveLength(1);

      // own transfers: listed and marked, but left out of the totals
      const own = (await list(db)).filter((r) => r.is_own_transfer);
      expect(own).toHaveLength(2);
      const s = await summary(db);
      expect(s).toMatchObject({ count: 5, came_in: "5700000", went_out: "1000000" });
      expect(s.by_month).toEqual([
        { month: "2031-03-01", came_in: "5000000", went_out: "1000000" },
        { month: "2031-04-01", came_in: "700000", went_out: "0" },
      ]);

      // a filter changes the list and its totals together
      expect(await summary(db, { p_direction: "out" })).toMatchObject({
        count: 2,
        came_in: "0",
        went_out: "1000000",
      });

      // status: nothing labelled yet (rules off)
      expect(await list(db, { p_status: "needs_label" })).toHaveLength(3);
      expect(await list(db, { p_status: "labelled" })).toHaveLength(2); // the own-transfer pair
      expect(await list(db, { p_status: "matched" })).toHaveLength(0);
    });
  });

  it("reads with the person's own rights: no role, no rows", async () => {
    await withRulesOff(async (db) => {
      const a = await account(db, "List C");
      await tx(db, a, "2031-05-01", "in", 1000);
      await actAs(db, await createUser(db, "viewer"));
      expect(await list(db)).toHaveLength(1);
      await actAsAdmin(db);
      await actAs(db, await createUser(db, "viewer"), "aal1"); // 2FA required, not passed
      expect(await list(db)).toHaveLength(0);
      expect((await summary(db)).count).toBe(0);
    });
  });
});
