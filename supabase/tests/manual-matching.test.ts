import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

const BASE = 731_000_000n;
let seq = 0;

async function setup(db: Client) {
  const customer = (
    await db.query("insert into customers (name) values ('PT By Hand') returning id")
  ).rows[0].id as string;
  const account = (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA','T','0011','csv') returning id",
    )
  ).rows[0].id as string;
  const owner = await createUser(db, "owner");
  const operator = await createUser(db, "operator");
  return { customer, account, owner, operator };
}

async function invoice(db: Client, s: Awaited<ReturnType<typeof setup>>, base = BASE) {
  await actAs(db, s.operator);
  const { rows } = await db.query(
    "select id, transfer_amount::text from create_invoice($1, $2, jakarta_today(), jakarta_today() + 14)",
    [s.customer, base.toString()],
  );
  await actAsAdmin(db);
  return rows[0] as { id: string; transfer_amount: string };
}

async function transfer(db: Client, account: string, amount: bigint) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, now(), $3, 'in', 'TRSF CASH') returning id`,
    [account, `hand-${++seq}`, amount.toString()],
  );
  return rows[0].id as string;
}

const invoiceState = async (db: Client, id: string) =>
  (
    await db.query("select status, invoice_paid(id)::text as paid from invoices where id = $1", [
      id,
    ])
  ).rows[0] as { status: string; paid: string };

describe("matching by hand", () => {
  it("an operator points at the transfer that paid a bill", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s);
      const tx = await transfer(db, s.account, BigInt(inv.transfer_amount));

      await actAs(db, s.operator);
      await db.query("select apply_payment($1, $2, $3, 'manual')", [
        inv.id,
        tx,
        inv.transfer_amount,
      ]);
      expect(await invoiceState(db, inv.id)).toEqual({
        status: "paid",
        paid: inv.transfer_amount,
      });

      await actAsAdmin(db);
      const { rows } = await db.query(
        "select method, created_by from payments where invoice_id = $1",
        [inv.id],
      );
      expect(rows).toEqual([{ method: "manual", created_by: s.operator }]);

      // the same call pointed the transfer's entry at the bill: one never saves without the other
      const entry = await db.query(
        `select e.invoice_id, e.customer_id, e.status, e.updated_by, c.name as category
           from entries e join categories c on c.id = e.category_id
          where e.bank_transaction_id = $1`,
        [tx],
      );
      expect(entry.rows).toEqual([
        {
          invoice_id: inv.id,
          customer_id: s.customer,
          status: "labelled",
          updated_by: s.operator,
          category: "Subscription income",
        },
      ]);
    });
  });

  it("a person can't point a transfer at a bill without a payment", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s);
      const tx = await transfer(db, s.account, BigInt(inv.transfer_amount));
      for (const who of [s.owner, s.operator]) {
        await actAs(db, who);
        for (const column of ["invoice_id", "customer_id"]) {
          const r = await tryQuery(
            db,
            `update entries set ${column} = $1 where bank_transaction_id = $2`,
            [column === "invoice_id" ? inv.id : s.customer, tx],
          );
          expect(r.error).toMatch(/permission denied/);
        }
      }
    });
  });
});

describe("health limits in rupiah", () => {
  it("are whole rupiah; the others may have decimals", async () => {
    await withRulesOff(async (db) => {
      const net = await tryQuery(
        db,
        "update health_thresholds set healthy_limit = 1000000.5 where signal = 'net_cashflow'",
      );
      expect(net.error).toMatch(/health_thresholds_whole_rupiah/);
      const low = await tryQuery(
        db,
        "update health_thresholds set warning_limit = -0.5 where signal = 'forecast_low'",
      );
      expect(low.error).toMatch(/health_thresholds_whole_rupiah/);
      const runway = await tryQuery(
        db,
        "update health_thresholds set healthy_limit = 12.5 where signal = 'runway'",
      );
      expect(runway.error).toBeNull();
    });
  });
});

describe("marking a bill paid without a transfer", () => {
  it("is refused for an operator, and for a viewer", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s);

      await actAs(db, s.operator);
      expect(
        (await tryQuery(db, "select mark_invoice_paid($1, 'paid me in cash')", [inv.id])).error,
      ).toMatch(/Only the owner/);

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "viewer"));
      expect(
        (await tryQuery(db, "select mark_invoice_paid($1, 'paid me in cash')", [inv.id])).error,
      ).toMatch(/Only the owner/);

      // and nobody can write such a payment directly
      await actAsAdmin(db);
      await actAs(db, s.operator);
      expect(
        (
          await tryQuery(
            db,
            "insert into payments (invoice_id, amount_applied, method, reason) values ($1, 1000, 'no_transfer', 'x')",
            [inv.id],
          )
        ).error,
      ).toMatch(/permission denied/);
    });
  });

  it("the owner settles what is left, with a reason, and it is audited", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s);
      const tx = await transfer(db, s.account, 1_000_000n);

      await actAs(db, s.operator);
      await db.query("select apply_payment($1, $2, 1000000, 'manual')", [inv.id, tx]);
      await actAsAdmin(db);

      await actAs(db, s.owner);
      expect((await tryQuery(db, "select mark_invoice_paid($1, '   ')", [inv.id])).error).toMatch(
        /Say why/,
      );
      const { rows } = await db.query("select * from mark_invoice_paid($1, $2)", [
        inv.id,
        "Paid me in cash at the office",
      ]);
      expect(rows[0]).toMatchObject({
        bank_transaction_id: null,
        method: "no_transfer",
        reason: "Paid me in cash at the office",
        amount_applied: (BASE - 1_000_000n).toString(),
      });
      expect((await invoiceState(db, inv.id)).status).toBe("paid");

      // a bill that isn't waiting for money can't be marked again
      expect((await tryQuery(db, "select mark_invoice_paid($1, 'again')", [inv.id])).error).toMatch(
        /not waiting for money/,
      );

      await actAsAdmin(db);
      const audit = await db.query(
        "select actor_id, action, reason from audit_log where record_id = $1",
        [rows[0].id],
      );
      expect(audit.rows).toEqual([
        { actor_id: s.owner, action: "insert", reason: "Paid me in cash at the office" },
      ]);
    });
  });

  it("shows up on the list of money the bank never saw", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s);
      await actAs(db, s.owner);
      await db.query("select mark_invoice_paid($1, 'Swapped for their design work')", [inv.id]);

      const { rows } = await db.query(
        "select customer_name, amount_applied::text, reason, created_by from payments_without_transfer where invoice_id = $1",
        [inv.id],
      );
      expect(rows).toEqual([
        {
          customer_name: "PT By Hand",
          amount_applied: BASE.toString(),
          reason: "Swapped for their design work",
          created_by: s.owner,
        },
      ]);
    });
  });

  it("a payment without a transfer needs a reason; one with a transfer keeps its link", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s);
      // the table itself refuses the shapes the functions would never produce
      for (const sql of [
        "insert into payments (invoice_id, amount_applied, method) values ($1, 1000, 'no_transfer')",
        "insert into payments (invoice_id, amount_applied, method, reason) values ($1, 1000, 'manual', 'x')",
      ]) {
        expect((await tryQuery(db, sql, [inv.id])).error).toMatch(
          /payments_no_transfer_needs_reason/,
        );
      }
    });
  });
});
