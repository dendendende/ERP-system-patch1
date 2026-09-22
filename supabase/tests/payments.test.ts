import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

let seq = 0;

/** A customer, a bank account and an operator acting in this transaction. */
async function setup(db: Client) {
  const customer = (await db.query("insert into customers (name) values ('Pay test') returning id"))
    .rows[0].id as string;
  const account = (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA','T','0009','csv') returning id",
    )
  ).rows[0].id as string;
  const operator = await createUser(db, "operator");
  await actAs(db, operator);
  return { customer, account, operator };
}

/** Bank transfer in (inserted as the database owner, like sync does). */
async function transfer(db: Client, account: string, amount: bigint, direction = "in") {
  await actAsAdmin(db);
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, '2031-04-01T09:00:00+07', $3, $4, 'TRSF') returning id`,
    [account, `pay-${++seq}`, amount.toString(), direction],
  );
  return rows[0].id as string;
}

async function invoice(db: Client, customer: string, base: bigint) {
  const { rows } = await db.query(
    "select id, number from create_invoice($1, $2, '2031-04-01', '2031-04-15')",
    [customer, base.toString()],
  );
  return rows[0].id as string;
}

async function state(db: Client, invoiceId: string) {
  const { rows } = await db.query(
    `select status, amount_due::text, transfer_amount::text, invoice_paid(id)::text as paid
       from invoices where id = $1`,
    [invoiceId],
  );
  return rows[0] as {
    status: string;
    amount_due: string;
    transfer_amount: string | null;
    paid: string;
  };
}

const pay = (db: Client, inv: string, tx: string, amount: bigint) =>
  db.query("select apply_payment($1, $2, $3)", [inv, tx, amount.toString()]);

const BASE = 4_900_000n;

describe("payments", () => {
  it("full payment: the exact unique amount marks the invoice paid, code included", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s.customer, BASE);
      const due = BigInt((await state(db, inv)).transfer_amount!);
      const tx = await transfer(db, s.account, due);
      await actAs(db, s.operator);
      await pay(db, inv, tx, due);
      expect(await state(db, inv)).toEqual({
        status: "paid",
        amount_due: due.toString(),
        transfer_amount: null,
        paid: due.toString(),
      });
    });
  });

  it("paying the base price without the code also pays the invoice", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s.customer, BASE);
      const tx = await transfer(db, s.account, BASE);
      await actAs(db, s.operator);
      await pay(db, inv, tx, BASE);
      expect(await state(db, inv)).toMatchObject({ status: "paid", amount_due: BASE.toString() });
    });
  });

  it("partial payment: partly paid, with a new unique amount for the rest; then paid", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s.customer, BASE);
      const before = await state(db, inv);

      const tx1 = await transfer(db, s.account, 2_000_000n);
      await actAs(db, s.operator);
      await pay(db, inv, tx1, 2_000_000n);
      const after = await state(db, inv);
      const rest = BASE - 2_000_000n; // the first code wasn't used, so it isn't owed
      const newCode = BigInt(after.transfer_amount!) - rest;
      expect(after.status).toBe("partly_paid");
      expect(after.amount_due).toBe(BASE.toString());
      expect(newCode >= 1n && newCode <= 999n).toBe(true);
      expect(after.transfer_amount).not.toBe(before.transfer_amount);

      // the new amount is unique too: another invoice can't ask for it
      const { rows } = await db.query(
        "select count(*)::int as n from invoices where transfer_amount = $1 and status in ('open','partly_paid')",
        [after.transfer_amount],
      );
      expect(rows[0].n).toBe(1);

      const tx2 = await transfer(db, s.account, BigInt(after.transfer_amount!));
      await actAs(db, s.operator);
      await pay(db, inv, tx2, BigInt(after.transfer_amount!));
      expect(await state(db, inv)).toMatchObject({
        status: "paid",
        amount_due: (BASE + newCode).toString(), // this code was used, so it was paid
      });
    });
  });

  it("overpayment: pays at most what is owed; the rest stays unapplied on the transfer", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s.customer, BASE);
      const due = BigInt((await state(db, inv)).transfer_amount!);
      const tx = await transfer(db, s.account, 5_000_000n);
      await actAs(db, s.operator);

      expect(
        (await tryQuery(db, "select apply_payment($1, $2, $3)", [inv, tx, (due + 1n).toString()]))
          .error,
      ).toMatch(/more than the invoice still owes/);
      await pay(db, inv, tx, due);
      expect((await state(db, inv)).status).toBe("paid");
      const { rows } = await db.query("select transaction_unapplied($1)::text as left", [tx]);
      expect(rows[0].left).toBe((5_000_000n - due).toString());
    });
  });

  it("one transfer pays two invoices, and can't be spent twice", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const a = await invoice(db, s.customer, 1_500_000n);
      const b = await invoice(db, s.customer, 2_750_000n);
      const dueA = BigInt((await state(db, a)).transfer_amount!);
      const dueB = BigInt((await state(db, b)).transfer_amount!);
      const tx = await transfer(db, s.account, dueA + dueB);
      await actAs(db, s.operator);
      await pay(db, a, tx, dueA);
      await pay(db, b, tx, dueB);
      expect((await state(db, a)).status).toBe("paid");
      expect((await state(db, b)).status).toBe("paid");

      const c = await invoice(db, s.customer, 1_000n);
      expect((await tryQuery(db, "select apply_payment($1, $2, 1)", [c, tx])).error).toMatch(
        /does not have that much money left/,
      );
    });
  });

  it("money going out, paid or void invoices can't take payments", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s.customer, BASE);
      const out = await transfer(db, s.account, 5_000_000n, "out");
      await actAs(db, s.operator);
      expect((await tryQuery(db, "select apply_payment($1, $2, 1000)", [inv, out])).error).toMatch(
        /Only money coming in/,
      );

      const tx = await transfer(db, s.account, 5_000_000n);
      await actAs(db, s.operator);
      await db.query("select void_invoice($1, 'test')", [inv]);
      expect((await tryQuery(db, "select apply_payment($1, $2, 1000)", [inv, tx])).error).toMatch(
        /not waiting for money/,
      );
    });
  });
});

describe("payment permissions", () => {
  it("viewers can't record payments; nobody writes payments or status directly", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s.customer, BASE);
      const tx = await transfer(db, s.account, 1_000n);

      await actAs(db, await createUser(db, "viewer"));
      expect((await tryQuery(db, "select apply_payment($1, $2, 1000)", [inv, tx])).error).toMatch(
        /Not allowed/,
      );

      await actAsAdmin(db);
      await actAs(db, s.operator);
      expect(
        (await tryQuery(db, "select apply_payment($1, $2, 1000, 'auto')", [inv, tx])).error,
      ).toMatch(/Only the matching engine/);
      expect(
        (
          await tryQuery(
            db,
            "insert into payments (bank_transaction_id, invoice_id, amount_applied, method) values ($1, $2, 1, 'manual')",
            [tx, inv],
          )
        ).error,
      ).toMatch(/permission denied/);
      expect(
        (await tryQuery(db, "update invoices set status = 'paid' where id = $1", [inv])).error,
      ).toMatch(/permission denied/);
    });
  });

  it("payments are audited with who recorded them, and can't be changed afterwards", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s.customer, BASE);
      const tx = await transfer(db, s.account, 1_000n);
      await actAs(db, s.operator);
      const { rows } = await db.query("select (apply_payment($1, $2, 1000)).id", [inv, tx]);
      await actAsAdmin(db);
      const log = await db.query("select actor_id, action from audit_log where record_id = $1", [
        rows[0].id,
      ]);
      expect(log.rows).toEqual([{ actor_id: s.operator, action: "insert" }]);
      expect((await tryQuery(db, "update payments set amount_applied = 1")).error).toMatch(
        /not allowed/,
      );
      expect((await tryQuery(db, "delete from payments")).error).toMatch(/not allowed/);
    });
  });
});
