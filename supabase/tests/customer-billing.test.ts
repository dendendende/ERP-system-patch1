import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRollback } from "./db";

const PRICE = 552_000_000n;

async function customer(db: Client, name: string, isActive = true) {
  return (
    await db.query("insert into customers (name, is_active) values ($1, $2) returning id", [
      name,
      isActive,
    ])
  ).rows[0].id as string;
}

async function subscription(db: Client, customerId: string, renewsInDays: number, status = "active") {
  await db.query(
    `insert into subscriptions (customer_id, plan_name, price, cycle, start_date, next_invoice_date, status)
     values ($1, 'Starter', $2, 'monthly', jakarta_today() - 60, jakarta_today() + $3::int, $4)`,
    [customerId, PRICE.toString(), renewsInDays, status],
  );
}

/** An invoice due `dueInDays` from today, as the operator creates it. */
async function invoice(db: Client, operator: string, customerId: string, dueInDays: number) {
  await actAs(db, operator);
  const { rows } = await db.query(
    `select id, transfer_amount::text from create_invoice($1, $2, jakarta_today() - 1,
       (jakarta_today() + $3::int)::date)`,
    [customerId, PRICE.toString(), dueInDays],
  );
  await actAsAdmin(db);
  return rows[0] as { id: string; transfer_amount: string };
}

async function billing(db: Client, id: string) {
  const { rows } = await db.query(
    `select still_owed::text, next_due::text, renews_on::text, is_late, is_renewing_soon, is_ongoing
       from customer_billing where id = $1`,
    [id],
  );
  return rows[0];
}

describe("customer billing list", () => {
  it("adds up what is still owed, and shows the earliest thing due", async () => {
    await withRollback(async (db) => {
      const operator = await createUser(db, "operator");
      const c = await customer(db, "PT Owes Two");
      const soon = await invoice(db, operator, c, 3);
      await invoice(db, operator, c, 30);

      // half of the first invoice paid → only the rest is still owed
      const tx = (
        await db.query(
          `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
           select id, 'cb-1', now(), $1, 'in', 'TRSF' from bank_accounts limit 1 returning id`,
          [(PRICE / 2n).toString()],
        )
      ).rows[0].id;
      await actAs(db, operator);
      await db.query("select apply_payment($1, $2, $3)", [soon.id, tx, (PRICE / 2n).toString()]);
      await actAsAdmin(db);

      const row = await billing(db, c);
      expect(row.still_owed).toBe((PRICE + PRICE / 2n).toString());
      const { rows } = await db.query("select (jakarta_today() + 3)::text as d");
      expect(row.next_due).toBe(rows[0].d);
      expect(row).toMatchObject({ is_late: false, is_ongoing: false });
    });
  });

  it("late when something is past due, renewing soon within two weeks", async () => {
    await withRollback(async (db) => {
      const operator = await createUser(db, "operator");
      const late = await customer(db, "PT Late");
      await invoice(db, operator, late, -1);
      await subscription(db, late, 40);

      const renewing = await customer(db, "CV Renewing");
      await subscription(db, renewing, 10);

      const ongoing = await customer(db, "PT Ongoing");
      await subscription(db, ongoing, 40);

      expect(await billing(db, late)).toMatchObject({ is_late: true, is_ongoing: true });
      expect(await billing(db, renewing)).toMatchObject({
        is_late: false,
        is_renewing_soon: true,
        is_ongoing: true,
        still_owed: "0",
      });
      expect(await billing(db, ongoing)).toMatchObject({
        is_renewing_soon: false,
        is_ongoing: true,
      });
    });
  });

  it("ended: switched off, or with no subscription running", async () => {
    await withRollback(async (db) => {
      const paused = await customer(db, "PT Paused");
      await subscription(db, paused, 5, "paused");
      const switchedOff = await customer(db, "PT Gone", false);
      await subscription(db, switchedOff, 5);
      const never = await customer(db, "PT One Off");

      for (const id of [paused, switchedOff, never]) {
        expect(await billing(db, id)).toMatchObject({ is_ongoing: false });
      }
      // a switched-off customer keeps its renewal date; it just isn't ongoing
      expect((await billing(db, paused)).renews_on).toBeNull();
    });
  });

  it("paid and voided invoices are not owed any more", async () => {
    await withRollback(async (db) => {
      const operator = await createUser(db, "operator");
      const c = await customer(db, "PT Settled");
      const inv = await invoice(db, operator, c, 5);
      await actAs(db, operator);
      await db.query("select void_invoice($1, 'test')", [inv.id]);
      await actAsAdmin(db);
      expect(await billing(db, c)).toMatchObject({ still_owed: "0", next_due: null });
    });
  });

  it("viewers see the list; it follows the same permissions as the tables", async () => {
    await withRollback(async (db) => {
      const c = await customer(db, "PT Visible");
      await actAs(db, await createUser(db, "viewer"));
      expect((await db.query("select 1 from customer_billing where id = $1", [c])).rowCount).toBe(1);
      await actAsAdmin(db);
      await actAs(db, await createUser(db, "viewer"), "aal1"); // not through 2FA yet
      expect((await db.query("select 1 from customer_billing where id = $1", [c])).rowCount).toBe(0);
    });
  });
});
