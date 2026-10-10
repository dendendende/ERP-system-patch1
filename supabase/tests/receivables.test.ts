import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  type Limit,
  type Receivables,
  aging,
  bucketMigration,
  cei,
  dso,
  outstanding,
  over90Share,
  overdueShare,
} from "../../src/lib/metrics";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

const M = 1_000_000;
let seq = 0;

/** A bill of `base` jt, written as the daily job would. */
async function bill(db: Client, base: number, issued: string, due: string) {
  await db.query("set local role service_role");
  const { rows } = await db.query(
    "select id from create_invoice((select id from customers order by created_at limit 1), $1, $2, $3)",
    [base * M, issued, due],
  );
  await db.query("reset role");
  return rows[0].id as string;
}

/** `amount` jt arriving at the bank on `day` and applied to the bill by an operator. */
async function pay(db: Client, acct: string, invoice: string, day: string, amount: number) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, 'in', 'X') returning id`,
    [acct, `ar-${++seq}`, day, amount * M],
  );
  await actAs(db, await createUser(db, "operator"));
  await db.query("select apply_payment($1, $2, $3)", [invoice, rows[0].id, amount * M]);
  await actAsAdmin(db);
}

const LIMITS: Limit[] = [
  { signal: "overdue_share", healthy_limit: 10, warning_limit: 15, direction: "lower_is_better" },
  { signal: "over_90_share", healthy_limit: 20, warning_limit: 25, direction: "lower_is_better" },
  { signal: "dso", healthy_limit: 45, warning_limit: 60, direction: "lower_is_better" },
  { signal: "cei", healthy_limit: 85, warning_limit: 75, direction: "higher_is_better" },
];

const big = (v: unknown) => BigInt(String(v));
const toReceivables = (r: Record<string, unknown>): Receivables => ({
  aging: (r.aging as unknown[]).map(big),
  sales_90: big(r.sales_90),
  begin_30: big(r.begin_30),
  sales_30: big(r.sales_30),
  voided_30: big(r.voided_30),
  migrated_from: (r.migrated_from as unknown[]).map(big),
  migrated_to: (r.migrated_to as unknown[]).map(big),
});

describe("receivables on a fixed dataset (hand-calculated)", () => {
  it("aging, % overdue, DSO, CEI, bucket migration and the top overdue, as of 30 June 2031", async () => {
    await withRulesOff(async (db) => {
      // only this test's bills are owed (the others are cancelled now, years before 2031)
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'test' where status in ('open', 'partly_paid')",
      );
      const acct = (
        await db.query(
          "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('AR', 'T', '0018', 'csv') returning id",
        )
      ).rows[0].id;

      await bill(db, 10, "2031-03-01", "2031-03-31"); // A: never paid
      const b = await bill(db, 20, "2031-04-10", "2031-05-10");
      await pay(db, acct, b, "2031-06-15", 5); // 15 left
      const c = await bill(db, 8, "2031-05-05", "2031-05-20");
      await pay(db, acct, c, "2031-06-05", 8); // paid in June
      await bill(db, 12, "2031-06-01", "2031-07-01"); // D: not due yet
      const e = await bill(db, 6, "2031-05-25", "2031-06-10");
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'sent by mistake' where id = $1",
        [e],
      );
      await db.query("update invoices set voided_at = '2031-06-20T09:00:00+07' where id = $1", [e]);
      await bill(db, 4, "2031-05-15", "2031-05-31"); // F: due on the last day of May
      const g = await bill(db, 7, "2031-06-10", "2031-06-20");
      await pay(db, acct, g, "2031-06-25", 7);

      const { rows } = await db.query("select * from receivables_summary('2031-06-30')");
      const r = toReceivables(rows[0]);
      expect(r).toEqual({
        // 30 June: D 12 not due · F 4 is 30 days late · B 15 is 51 · A 10 is 91
        aging: [12, 4, 15, 0, 10].map((x) => BigInt(x * M)),
        // billed 2 Apr – 30 Jun and not cancelled: B 20 + C 8 + D 12 + F 4 + G 7 (A before; E cancelled)
        sales_90: BigInt(51 * M),
        // 31 May: A 10 + B 20 + C 8 + E 6 + F 4
        begin_30: BigInt(48 * M),
        sales_30: BigInt(19 * M), // D 12 + G 7
        voided_30: BigInt(6 * M), // E
        // 31 May by bucket: not due E 6 + F 4 · 1–30 B 20 + C 8 · 31–60 none · 61–90 A 10
        migrated_from: [10, 28, 0, 10].map((x) => BigInt(x * M)),
        // a month on: F 4 is 1–30 late (E cancelled) · B 15 is 31–60 (C paid) · A 10 is 90+
        migrated_to: [4, 15, 0, 10].map((x) => BigInt(x * M)),
      });

      // the metrics, against the same day a month earlier as "previous" (here: itself)
      expect(outstanding(r, r).value).toBe(BigInt(41 * M));
      expect(aging(r).map((x) => x.share)).toEqual([29.3, 9.8, 36.6, 0, 24.4]);
      // past due 29 of 41 = 70.7%
      expect(overdueShare(r, r, LIMITS)).toMatchObject({ value: 70.7, status: "danger" });
      // 10 of 41 = 24.4%: warning (over 20, not over 25)
      expect(over90Share(r, r, LIMITS)).toMatchObject({ value: 24.4, status: "warning" });
      // 41 ÷ 51 × 90 = 72.35 days
      expect(dso(r, r, LIMITS)).toMatchObject({ value: 72.4, status: "danger" });
      // collectible 48 + 19 − 6 − 12 not due = 49; collected 48 + 19 − 6 − 41 = 20
      // (= the June payments: B 5 + C 8 + G 7) → 40.8%
      expect(cei(r, r, LIMITS)).toMatchObject({ value: 40.8, status: "danger" });
      // 4 of 10 · 15 of 28 · nothing to move · 10 of 10
      expect(bucketMigration(r, r).map((m) => m.value)).toEqual([40, 53.6, null, 100]);

      const top = await db.query(
        "select number, owed::text, days_late, last_reminded from top_overdue('2031-06-30')",
      );
      expect(top.rows.map((t) => [t.owed, t.days_late, t.last_reminded])).toEqual([
        [String(15 * M), 51, null], // B
        [String(10 * M), 91, null], // A
        [String(4 * M), 30, null], // F
      ]);
      expect(top.rows[0].number).toBe(
        (await db.query("select number from invoices where id = $1", [b])).rows[0].number,
      );

      // P8-T8a: the bills list adds up to the same aging, bucket by bucket — a cue and the list
      // it opens always agree
      const list = (
        await db.query(
          "select bill_list_summary('waiting', p_on => '2031-06-30') as s, bill_list_summary('late', p_on => '2031-06-30') as late",
        )
      ).rows[0];
      expect(list.s.owed).toBe(String(41 * M));
      expect(list.s.aging.map((a: { owed: string }) => BigInt(a.owed))).toEqual(r.aging);
      expect(list.s.aging.map((a: { count: number }) => a.count)).toEqual([1, 1, 1, 0, 1]);
      expect(list.late).toMatchObject({ count: 3, past_due: String(29 * M) });
      // P8-T9: "more than 30 days late" is the health check's late — B (51) and A (91), not F (30)
      const late30 = await db.query(
        "select bill_list_summary('late_30', p_on => '2031-06-30') ->> 'owed' as owed",
      );
      expect(late30.rows[0].owed).toBe(String(25 * M));
      // bucket 0 is a filter of its own (not "any"), and B shows what it was billed and paid
      const notDue = await db.query(
        "select owed::text from bill_list(p_bucket => 0, p_on => '2031-06-30')",
      );
      expect(notDue.rows).toEqual([{ owed: String(12 * M) }]);
      const bRow = await db.query(
        "select billed::text, paid::text, owed::text, days_late, bucket from bill_list(p_on => '2031-06-30') where id = $1",
        [b],
      );
      expect(bRow.rows[0]).toEqual({
        billed: String(20 * M),
        paid: String(5 * M),
        owed: String(15 * M),
        days_late: 51,
        bucket: 2,
      });
    });
  });

  it("a cancelled bill gets its cancel time from the database", async () => {
    await withRulesOff(async (db) => {
      const id = await bill(db, 3, "2031-01-01", "2031-01-31");
      expect(
        (await db.query("select voided_at from invoices where id = $1", [id])).rows[0].voided_at,
      ).toBeNull();
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'test' where id = $1",
        [id],
      );
      const { rows } = await db.query(
        "select voided_at is not null as stamped from invoices where id = $1",
        [id],
      );
      expect(rows[0].stamped).toBe(true);
    });
  });
});
