import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

let seq = 0;
// Unusual amounts and 2031 dates, so real data in a local database never fits these invoices.
const BASE = 612_345_000n;

async function setup(db: Client) {
  const customer = (
    await db.query("insert into customers (name) values ('PT Cocok Sekali') returning id")
  ).rows[0].id as string;
  const account = (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA','T','0010','csv') returning id",
    )
  ).rows[0].id as string;
  const operator = await createUser(db, "operator");
  return { customer, account, operator };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function invoice(db: Client, s: Setup, base: bigint, issued = "2031-04-01") {
  await actAs(db, s.operator);
  const { rows } = await db.query(
    "select id, number, transfer_amount::text from create_invoice($1, $2, $3, '2031-04-30')",
    [s.customer, base.toString(), issued],
  );
  await actAsAdmin(db);
  return rows[0] as { id: string; number: string; transfer_amount: string };
}

async function transfer(
  db: Client,
  s: Setup,
  amount: bigint | string,
  description = "TRSF E-BANKING CR SOMEONE",
  direction = "in",
) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, '2031-04-10T09:00:00+07', $3, $4, $5) returning id`,
    [s.account, `match-${++seq}`, amount.toString(), direction, description],
  );
  return rows[0].id as string;
}

async function runMatching(db: Client) {
  await db.query("set local role service_role");
  await db.query("select match_payments()");
  await actAsAdmin(db);
}

/** What the engine did with one transfer. */
async function outcome(db: Client, tx: string) {
  const { rows } = await db.query(
    `select e.invoice_id, e.customer_id, e.status, c.name as category,
            (select coalesce(json_agg(json_build_object('invoice', p.invoice_id,
                     'amount', p.amount_applied::text, 'method', p.method)), '[]')
               from payments p where p.bank_transaction_id = t.id) as payments
       from bank_transactions t
       join entries e on e.bank_transaction_id = t.id
       left join categories c on c.id = e.category_id
      where t.id = $1`,
    [tx],
  );
  return rows[0];
}

const status = async (db: Client, inv: string) =>
  (await db.query("select status from invoices where id = $1", [inv])).rows[0].status as string;

describe("matching rules", () => {
  it("1. exact unique amount → paid, Subscription income, customer linked", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s, BASE);
      const tx = await transfer(db, s, inv.transfer_amount);
      await runMatching(db);
      expect(await outcome(db, tx)).toEqual({
        invoice_id: inv.id,
        customer_id: s.customer,
        status: "auto",
        category: "Subscription income",
        payments: [{ invoice: inv.id, amount: inv.transfer_amount, method: "auto" }],
      });
      expect(await status(db, inv.id)).toBe("paid");
    });
  });

  it("2. invoice number in the description → applies up to what is owed", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s, BASE);
      const digits = inv.number.replace("INV-", "");
      // part of it, number written without the dash
      const part = await transfer(db, s, 100_000_000n, `TRSF CR INV${digits} THANKS`);
      await runMatching(db);
      expect(await outcome(db, part)).toMatchObject({
        invoice_id: inv.id,
        category: "Partial payment",
        payments: [{ invoice: inv.id, amount: "100000000", method: "auto" }],
      });
      expect(await status(db, inv.id)).toBe("partly_paid");

      // more than the rest: pays the rest, the extra stays unapplied on the transfer
      const big = await transfer(db, s, 900_000_000n, `PAYMENT ${inv.number.toLowerCase()}`);
      await runMatching(db);
      expect(await outcome(db, big)).toMatchObject({
        invoice_id: inv.id,
        category: "Subscription income",
      });
      expect(await status(db, inv.id)).toBe("paid");
      const { rows } = await db.query("select transaction_unapplied($1)::text as left", [big]);
      expect(BigInt(rows[0].left) > 0n).toBe(true);
    });
  });

  it("3. exactly the rest of a partly paid invoice, from that customer → paid", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s, BASE);
      const first = await transfer(db, s, 12_345_000n);
      await actAs(db, s.operator);
      await db.query("select apply_payment($1, $2, 12345000)", [inv.id, first]);
      await actAsAdmin(db);
      const rest = BASE - 12_345_000n; // what is still owed, without the new code

      // the same amount from a stranger is not enough
      const stranger = await transfer(db, s, rest, "TRSF CR SOMEBODY ELSE");
      await runMatching(db);
      expect((await outcome(db, stranger)).payments).toEqual([]);

      const tx = await transfer(db, s, rest, "TRSF E-BANKING CR 0410/FTSCY PT COCOK SEKALI");
      await runMatching(db);
      expect(await outcome(db, tx)).toMatchObject({
        invoice_id: inv.id,
        category: "Subscription income",
      });
      expect(await status(db, inv.id)).toBe("paid");
    });
  });

  it("4. nothing fits → left for a person, with suggestions", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s, BASE);
      const tx = await transfer(db, s, 5_000_000n, "TRSF CR PT COCOK SEKALI");
      await runMatching(db);
      expect(await outcome(db, tx)).toMatchObject({
        invoice_id: null,
        status: "needs_label",
        payments: [],
      });
      const { rows } = await db.query("select invoice_id, strong from invoice_candidates($1)", [
        tx,
      ]);
      expect(rows).toContainEqual({ invoice_id: inv.id, strong: false });
    });
  });
});

describe("matching never guesses", () => {
  it("amount fits one invoice, description names another → nothing applied", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const a = await invoice(db, s, BASE);
      const b = await invoice(db, s, BASE + 1_000n);
      const tx = await transfer(db, s, a.transfer_amount, `TRSF ${b.number}`);
      await runMatching(db);
      expect((await outcome(db, tx)).payments).toEqual([]);
      expect([await status(db, a.id), await status(db, b.id)]).toEqual(["open", "open"]);
    });
  });

  it("two invoice numbers in one description → nothing applied", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const a = await invoice(db, s, BASE);
      const b = await invoice(db, s, BASE);
      const tx = await transfer(db, s, 1_000_000n, `${a.number} ${b.number}`);
      await runMatching(db);
      expect((await outcome(db, tx)).payments).toEqual([]);
    });
  });

  it("the same rest on two partly paid invoices of that customer → nothing applied", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const a = await invoice(db, s, BASE);
      const b = await invoice(db, s, BASE + 1n);
      // both still owe BASE - 1.000.000 after these
      for (const [inv, paid] of [
        [a, 1_000_000n],
        [b, 1_000_001n],
      ] as const) {
        const t = await transfer(db, s, paid);
        await actAs(db, s.operator);
        await db.query("select apply_payment($1, $2, $3)", [inv.id, t, paid.toString()]);
        await actAsAdmin(db);
      }
      const tx = await transfer(db, s, BASE - 1_000_000n, "PT COCOK SEKALI");
      await runMatching(db);
      expect((await outcome(db, tx)).payments).toEqual([]);
    });
  });

  it("ignores money going out, invoices issued after the money came in, and people's labels", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const later = await invoice(db, s, BASE, "2031-04-20");
      const early = await transfer(db, s, later.transfer_amount);

      const inv = await invoice(db, s, BASE + 5_000n);
      const out = await transfer(db, s, inv.transfer_amount, "TRSF", "out");
      const labelled = await transfer(db, s, inv.transfer_amount);
      const other = (
        await db.query("select id from categories where name = 'Other income' and is_system")
      ).rows[0].id;
      await actAs(db, s.operator);
      await db.query("update entries set category_id = $1 where bank_transaction_id = $2", [
        other,
        labelled,
      ]);
      await actAsAdmin(db);

      await runMatching(db);
      for (const tx of [early, out, labelled]) {
        expect((await outcome(db, tx)).payments).toEqual([]);
      }
      expect(await status(db, inv.id)).toBe("open");
    });
  });
});

describe("matching runs", () => {
  it("is safe to run again: one payment per transfer, ever", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const inv = await invoice(db, s, BASE);
      const tx = await transfer(db, s, inv.transfer_amount);
      await runMatching(db);
      await runMatching(db);
      await runMatching(db);
      expect((await outcome(db, tx)).payments).toHaveLength(1);
    });
  });

  it("only the matching engine can run it", async () => {
    await withRulesOff(async (db) => {
      await actAs(db, await createUser(db, "owner"));
      expect((await tryQuery(db, "select match_payments()")).error).toMatch(/permission denied/);
    });
  });
});
