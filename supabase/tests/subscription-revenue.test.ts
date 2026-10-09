import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  type Earned,
  type Limit,
  type Mrr,
  arr,
  concentration,
  mrr,
  mrrMovement,
  ranked,
  renewalRate,
} from "../../src/lib/metrics";
import { actAs, actAsAdmin, createUser, withRollback, withRulesOff } from "./db";

const LIMITS: Limit[] = [
  { signal: "renewal_rate", healthy_limit: 90, warning_limit: 80, direction: "higher_is_better" },
  {
    signal: "top_customer_share",
    healthy_limit: 20,
    warning_limit: 35,
    direction: "lower_is_better",
  },
];

const M = 1_000_000;
const at = (day: string) => `${day}T10:00:00+07`;

/**
 * A subscription with a history written by hand: the audit trigger is off for this (rolled-back)
 * transaction, so the log says exactly when it was entered and changed.
 */
async function subscription(
  db: Client,
  s: { price: number; cycle: string; start: string; enteredOn: string },
  changes: [day: string, change: Record<string, string | number | null>][] = [],
) {
  const { rows } = await db.query(
    `insert into subscriptions (customer_id, plan_name, price, cycle, start_date, next_invoice_date)
     values ((select id from customers order by created_at limit 1), 'Plan', $1, $2, $3, $3)
     returning id, to_jsonb(subscriptions.*) as row`,
    [s.price * M, s.cycle, s.start],
  );
  const id = rows[0].id as string;
  await db.query(
    "insert into audit_log (action, table_name, record_id, new_value, created_at) values ('insert', 'subscriptions', $1, $2, $3)",
    [id, rows[0].row, at(s.enteredOn)],
  );
  for (const [day, change] of changes) {
    const sets = Object.keys(change).map((k, i) => `${k} = $${i + 2}`);
    await db.query(`update subscriptions set ${sets.join(", ")} where id = $1`, [
      id,
      ...Object.values(change),
    ]);
    await db.query(
      "insert into audit_log (action, table_name, record_id, new_value, created_at) values ('update', 'subscriptions', $1, $2, $3)",
      [id, JSON.stringify(change), at(day)],
    );
  }
  return id;
}

const summary = async (db: Client, day: string): Promise<Mrr> => {
  await db.query("set local role service_role"); // as the daily job: the function answers roles only
  const { rows } = await db.query("select * from mrr_summary($1)", [day]);
  await db.query("reset role");
  return {
    arr: BigInt(rows[0].arr),
    active: rows[0].active,
    arr_added: BigInt(rows[0].arr_added),
    arr_lost: BigInt(rows[0].arr_lost),
  };
};

describe("MRR / ARR on a fixed history (hand-calculated)", () => {
  it("replays each subscription as it was, and splits this month into added and lost", async () => {
    await withRollback(async (db) => {
      // only this test's subscriptions count: end the others (logged, years before 2031)
      await db.query("update subscriptions set status = 'ended'");
      await db.query("alter table subscriptions disable trigger audit_row_change");

      // S1 3 jt a month, all along: 36 a year
      await subscription(db, {
        price: 3,
        cycle: "monthly",
        start: "2031-01-01",
        enteredOn: "2031-01-01",
      });
      // S2 24 jt a year from March: 24
      await subscription(db, {
        price: 24,
        cycle: "yearly",
        start: "2031-03-01",
        enteredOn: "2031-02-20",
      });
      // S3 9 jt a quarter (36), priced up to 12 (48) on 5 June
      const s3 = await subscription(
        db,
        { price: 9, cycle: "quarterly", start: "2031-01-01", enteredOn: "2031-01-01" },
        [["2031-06-05", { price: 12 * M }]],
      );
      // S4 new: 2 jt a month (24) from 10 June
      await subscription(db, {
        price: 2,
        cycle: "monthly",
        start: "2031-06-10",
        enteredOn: "2031-06-01",
      });
      // S5 5 jt a month (60), ended on 7 June
      await subscription(
        db,
        { price: 5, cycle: "monthly", start: "2031-01-01", enteredOn: "2031-01-01" },
        [["2031-06-07", { status: "ended", end_date: "2031-06-07" }]],
      );
      // S6 1 jt a month (12) since January but only entered on 10 May (setup), paused on 12 May
      await subscription(
        db,
        { price: 1, cycle: "monthly", start: "2031-01-01", enteredOn: "2031-05-10" },
        [["2031-05-12", { status: "paused" }]],
      );
      // S7 starts in July: not running yet
      await subscription(db, {
        price: 4,
        cycle: "monthly",
        start: "2031-07-01",
        enteredOn: "2031-06-12",
      });

      const now = await summary(db, "2031-06-15");
      // running 15 June: S1 36 + S2 24 + S3 48 + S4 24 = 132; added S3 +12, S4 +24; lost S5 60
      expect(now).toEqual({
        arr: BigInt(132 * M),
        active: 4,
        arr_added: BigInt(36 * M),
        arr_lost: BigInt(60 * M),
      });
      const monthAgo = await summary(db, "2031-05-15");
      // 15 May: S1 36 + S2 24 + S3 36 + S5 60 = 156 (S6 paused on the 12th); May so far: S6 lost 12
      expect(monthAgo).toEqual({
        arr: BigInt(156 * M),
        active: 4,
        arr_added: 0n,
        arr_lost: BigInt(12 * M),
      });

      // a change is only seen from its day on
      await db.query("set local role service_role");
      const before = await db.query(
        "select price from subscription_state_on('2031-06-04') where subscription_id = $1",
        [s3],
      );
      expect(before.rows[0].price).toBe(String(9 * M));
      await db.query("reset role");

      expect(mrr(now, monthAgo)).toMatchObject({
        value: BigInt(11 * M), // 132 ÷ 12
        previous: BigInt(13 * M), // 156 ÷ 12
        trend: { direction: "down", percent: -15.3, good: false },
        href: "/customers?show=active",
      });
      expect(arr(now, monthAgo).value).toBe(BigInt(132 * M));
      // added 3 jt − lost 5 jt = −2 jt (= 11 now − 13 at the end of May); May to the 15th: −1 jt
      expect(mrrMovement(now, monthAgo)).toMatchObject({
        value: BigInt(-2 * M),
        previous: BigInt(-1 * M),
        added: BigInt(3 * M),
        lost: BigInt(5 * M),
      });
    });
  });

  it("answers nobody without a role (it reads the owner-only change log)", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "viewer"), "aal1"); // 2-step sign-in not done: no role
      const { rows } = await db.query(
        "select count(*)::int as n from subscription_state_on(jakarta_today())",
      );
      expect(rows[0].n).toBe(0);
    });
  });
});

describe("renewals and revenue on a fixed dataset (hand-calculated)", () => {
  it("renewal rate, revenue by customer and plan, concentration — and the health check agrees", async () => {
    await withRulesOff(async (db) => {
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'test' where status in ('open', 'partly_paid')",
      );
      const customer = async (name: string) =>
        (await db.query("insert into customers (name) values ($1) returning id", [name])).rows[0]
          .id as string;
      const alpha = await customer("Alpha");
      const beta = await customer("Beta");
      const plan = async (c: string, name: string, price: number) =>
        (
          await db.query(
            `insert into subscriptions (customer_id, plan_name, price, cycle, start_date, next_invoice_date)
             values ($1, $2, $3, 'monthly', '2031-01-01', '2031-07-01') returning id`,
            [c, name, price * M],
          )
        ).rows[0].id as string;
      const pro = await plan(alpha, "Pro", 10);
      const basic = await plan(beta, "Basic", 4);
      const acct = (
        await db.query(
          "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('RV', 'T', '0019', 'csv') returning id",
        )
      ).rows[0].id;

      const bill = async (
        c: string,
        sub: string | null,
        base: number,
        issued: string,
        due: string,
      ) => {
        await db.query("set local role service_role");
        const { rows } = await db.query("select id from create_invoice($1, $2, $3, $4, $5)", [
          c,
          base * M,
          issued,
          due,
          sub,
        ]);
        await db.query("reset role");
        return rows[0].id as string;
      };
      const operator = await createUser(db, "operator");
      const pay = async (invoice: string, day: string, amount: number) => {
        const { rows } = await db.query(
          `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
           values ($1, $2, $3::timestamptz, $4, 'in', 'X') returning id`,
          [acct, `rv-${day}-${invoice}`, at(day), amount * M],
        );
        await actAs(db, operator);
        await db.query("select apply_payment($1, $2, $3)", [invoice, rows[0].id, amount * M]);
        await actAsAdmin(db);
      };

      await pay(await bill(alpha, pro, 10, "2031-04-01", "2031-04-10"), "2031-04-08", 10); // b1 renewed
      await pay(await bill(alpha, pro, 10, "2031-05-01", "2031-05-10"), "2031-05-20", 10); // b2 renewed (late)
      await bill(beta, basic, 4, "2031-04-01", "2031-04-10"); // b3 unpaid 81 days: lost
      await bill(beta, basic, 4, "2031-05-25", "2031-06-05"); // b4 unpaid 25 days: not decided yet
      const b5 = await bill(beta, basic, 4, "2031-06-01", "2031-06-10");
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'gave up' where id = $1",
        [b5],
      );
      await db.query("update invoices set voided_at = $2 where id = $1", [b5, at("2031-06-12")]); // b5 lost
      await pay(await bill(alpha, pro, 10, "2031-06-01", "2031-06-10"), "2031-06-12", 6); // b6 4 left: not decided
      await pay(await bill(beta, null, 6, "2031-03-01", "2031-03-10"), "2031-03-05", 6); // b7 one-off, paid
      const b8 = await bill(beta, null, 5, "2031-02-01", "2031-02-10"); // b8 marked paid: no money came in
      await actAs(db, await createUser(db, "owner"));
      await db.query("select mark_invoice_paid($1, 'settled in cash')", [b8]);
      await actAsAdmin(db);

      const counts = async (day: string) =>
        (await db.query("select * from renewal_counts($1)", [day])).rows[0];
      expect(await counts("2031-06-30")).toEqual({ renewed: 2, lost: 2 }); // b1 b2 · b3 b5
      // a month earlier: b1, b2 paid by then; b3 already 30+ days late; b4–b6 not due yet
      expect(await counts("2031-05-30")).toEqual({ renewed: 2, lost: 1 });
      expect(renewalRate({ renewed: 2, lost: 2 }, { renewed: 2, lost: 1 }, LIMITS)).toMatchObject({
        value: 50,
        previous: 66.7,
        status: "danger",
      });

      const earned = async (day: string): Promise<Earned[]> =>
        (await db.query("select * from revenue_by_customer($1)", [day])).rows.map((r) => ({
          name: r.customer,
          total: BigInt(r.total),
          href: `/customers/${r.customer_id}`,
        }));
      // Alpha 10 + 10 + 6 = 26 · Beta 6 (b7; b8 never came through the bank)
      const now = await earned("2031-06-30");
      expect(ranked(now).map((r) => [r.name, r.total, r.share])).toEqual([
        ["Alpha", BigInt(26 * M), 81.3],
        ["Beta", BigInt(6 * M), 18.8],
      ]);
      const plans = await db.query("select plan, total::text from revenue_by_plan('2031-06-30')");
      expect(plans.rows).toEqual([
        { plan: "Pro", total: String(26 * M) },
        { plan: null, total: String(6 * M) }, // the one-off bill
      ]);
      // a month earlier: Alpha 20 of 26 = 76.9%
      const c = concentration(now, await earned("2031-05-30"), LIMITS);
      expect(c).toMatchObject({
        value: 81.3,
        previous: 76.9,
        status: "danger",
        customer: "Alpha",
        href: `/customers/${alpha}`,
      });

      await db.query("set local role service_role");
      const health = await db.query(
        "select signal, value::float8 as value, explanation from take_health_snapshot('2031-06-30') where signal in ('renewal_rate', 'top_customer_share') order by signal",
      );
      await db.query("reset role");
      expect(health.rows).toEqual([
        {
          signal: "renewal_rate",
          value: 50,
          explanation: "2 of 4 subscription renewals in the last 12 months were paid (50.0%).",
        },
        {
          signal: "top_customer_share",
          value: 81.3,
          explanation: "Alpha brought in 81.3% of the last 12 months' income from bills.",
        },
      ]);
    });
  });
});
