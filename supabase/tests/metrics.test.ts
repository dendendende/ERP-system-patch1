import { describe, expect, it } from "vitest";
import { type Limit, statusAgainst } from "../../src/lib/metrics";
import { withRollback, withRulesOff } from "./db";

describe("metrics: the app's status rule is the database's", () => {
  it("statusAgainst gives what health_status gives, at and around every limit", async () => {
    await withRollback(async (db) => {
      const { rows: limits } = await db.query<Limit>(
        "select signal, healthy_limit::float8 as healthy_limit, warning_limit::float8 as warning_limit, direction from health_thresholds where warning_limit is not null",
      );
      expect(limits.map((l) => l.signal)).toContain("forecast_off");
      for (const l of limits) {
        for (const v of [l.healthy_limit, l.warning_limit!].flatMap((x) => [x - 0.1, x, x + 0.1])) {
          const { rows } = await db.query("select health_status($1, $2) as s", [v, l.signal]);
          expect(statusAgainst(v, l), `${l.signal} at ${v}`).toBe(rows[0].s);
        }
      }
    });
  });
});

describe("money_list: regular costs", () => {
  it("status 'recurring' lists only what is marked as a regular cost", async () => {
    await withRulesOff(async (db) => {
      const acct = (
        await db.query(
          "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('R', 'T', '0017', 'csv') returning id",
        )
      ).rows[0].id;
      const ids: string[] = [];
      for (const [i, amount] of [3_000_000, 30_000_000].entries()) {
        const { rows } = await db.query(
          `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
           values ($1, $2, '2031-03-10T10:00:00+07', $3, 'out', 'X') returning id`,
          [acct, `rec-${i}`, amount],
        );
        ids.push(rows[0].id);
      }
      await db.query("update entries set is_recurring = true where bank_transaction_id = $1", [
        ids[0],
      ]);
      const { rows } = await db.query(
        "select id from money_list(p_status => 'recurring', p_account => $1)",
        [acct],
      );
      expect(rows.map((r) => r.id)).toEqual([ids[0]]);
    });
  });
});
