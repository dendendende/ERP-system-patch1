import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

let seq = 0;

type Ctx = { account: string; operator: string };

async function customerWithSubscription(db: Client, name: string, renewsInDays: number) {
  const customer = (await db.query("insert into customers (name) values ($1) returning id", [name])).rows[0].id as string;
  const sub = (
    await db.query(
      `insert into subscriptions (customer_id, plan_name, price, cycle, start_date, next_invoice_date)
       values ($1, 'Starter', 2000000, 'monthly', jakarta_today() - 120, jakarta_today() + $2::int) returning id`,
      [customer, renewsInDays],
    )
  ).rows[0].id as string;
  return { customer, sub };
}

/** A past bill of this subscription; each entry in `payments` is [amount, days after due it came in]. */
async function pastBill(db: Client, ctx: Ctx, customer: string, sub: string, payments: [number, number][]) {
  await actAs(db, ctx.operator);
  const inv = (
    await db.query(
      "select id, transfer_amount from create_invoice($1, 2000000, jakarta_today() - 50, jakarta_today() - 35, $2)",
      [customer, sub],
    )
  ).rows[0];
  await actAsAdmin(db);
  for (const [amount, lateDays] of payments) {
    const tx = (
      await db.query(
        `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
         values ($1, $2, ((jakarta_today() - 35 + $3::int)::text || 'T10:00:00+07')::timestamptz, $4, 'in', 'TRSF') returning id`,
        [ctx.account, `pipe-${++seq}`, lateDays, amount],
      )
    ).rows[0].id;
    await actAs(db, ctx.operator);
    await db.query("select apply_payment($1, $2, $3)", [inv.id, tx, amount]);
    await actAsAdmin(db);
  }
  // its own reminders are history now; the flag tests below decide what is waiting
  await db.query("update reminders set status = 'cancelled', error = 'test' where invoice_id = $1 and status = 'scheduled'", [inv.id]);
}

async function flags(db: Client, sub: string) {
  const { rows } = await db.query(
    "select paid_late_last_cycle, reminders_waiting, partial_payments, recently_paused from renewal_pipeline where subscription_id = $1",
    [sub],
  );
  return rows[0];
}

describe("renewal pipeline", () => {
  it("flags each risk on its own, and none on a customer who pays on time", async () => {
    await withRulesOff(async (db) => {
      const ctx: Ctx = {
        account: (
          await db.query(
            "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA','T','0021','csv') returning id",
          )
        ).rows[0].id,
        operator: await createUser(db, "operator"),
      };

      const good = await customerWithSubscription(db, "PT On Time", 20);
      await pastBill(db, ctx, good.customer, good.sub, [[2000000, 0]]);

      const late = await customerWithSubscription(db, "PT Late", 20);
      await pastBill(db, ctx, late.customer, late.sub, [[2000000, 9]]);

      const parts = await customerWithSubscription(db, "PT In Parts", 40);
      await pastBill(db, ctx, parts.customer, parts.sub, [[1000000, 0], [1000000, 0]]);

      const waiting = await customerWithSubscription(db, "PT Waiting", 10);
      await db.query("set local role service_role");
      await db.query("select create_invoice($1, 2000000, jakarta_today(), jakarta_today() + 10)", [waiting.customer]);
      await actAsAdmin(db); // its own bill message is due now and nobody has sent it

      const paused = await customerWithSubscription(db, "PT Paused", 30);
      await db.query("update subscriptions set status = 'paused' where id = $1", [paused.sub]);
      await db.query("update subscriptions set status = 'active' where id = $1", [paused.sub]);

      const none = { paid_late_last_cycle: false, reminders_waiting: false, partial_payments: false, recently_paused: false };
      expect(await flags(db, good.sub)).toEqual(none);
      expect(await flags(db, late.sub)).toEqual({ ...none, paid_late_last_cycle: true });
      expect(await flags(db, parts.sub)).toEqual({ ...none, partial_payments: true });
      expect(await flags(db, waiting.sub)).toEqual({ ...none, reminders_waiting: true });
      expect(await flags(db, paused.sub)).toEqual({ ...none, recently_paused: true });
    });
  });

  it("only active subscriptions renewing in the next 90 days", async () => {
    await withRulesOff(async (db) => {
      const soon = await customerWithSubscription(db, "PT Soon", 89);
      const far = await customerWithSubscription(db, "PT Far", 91);
      const off = await customerWithSubscription(db, "PT Off", 5);
      await db.query("update subscriptions set status = 'paused' where id = $1", [off.sub]);
      expect(await flags(db, soon.sub)).toBeDefined();
      expect(await flags(db, far.sub)).toBeUndefined();
      expect(await flags(db, off.sub)).toBeUndefined();
    });
  });
});
