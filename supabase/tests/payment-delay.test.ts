import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

let seq = 0;

/** A bill due `due`, paid in full by a transfer on `paidOn`. */
async function paidBill(db: Client, s: { customer: string; account: string; operator: string }, due: string, paidOn: string) {
  await actAs(db, s.operator);
  const inv = (
    await db.query("select id, transfer_amount::text from create_invoice($1, 2000000, '2031-01-01', $2)", [s.customer, due])
  ).rows[0];
  await actAsAdmin(db);
  const tx = (
    await db.query(
      `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
       values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, 'in', 'TRSF') returning id`,
      [s.account, `delay-${++seq}`, paidOn, inv.transfer_amount],
    )
  ).rows[0].id;
  await actAs(db, s.operator);
  await db.query("select apply_payment($1, $2, $3)", [inv.id, tx, inv.transfer_amount]);
  await actAsAdmin(db);
}

describe("how late a customer usually pays", () => {
  it("averages days late over paid bills; paying early counts as on time", async () => {
    await withRulesOff(async (db) => {
      const s = {
        customer: (await db.query("insert into customers (name) values ('PT Late Payer') returning id")).rows[0].id,
        account: (
          await db.query(
            "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA','T','0020','csv') returning id",
          )
        ).rows[0].id,
        operator: await createUser(db, "operator"),
      };
      await paidBill(db, s, "2031-02-10", "2031-02-20"); // 10 days late
      await paidBill(db, s, "2031-03-10", "2031-03-14"); // 4 days late
      await paidBill(db, s, "2031-04-10", "2031-04-05"); // early → 0
      const { rows } = await db.query(
        "select avg_delay_days::text, paid_bills from customer_payment_delay where customer_id = $1",
        [s.customer],
      );
      expect(rows).toEqual([{ avg_delay_days: "4.7", paid_bills: 3 }]); // (10 + 4 + 0) / 3
    });
  });
});
