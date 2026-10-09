import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";

async function customer(db: Client) {
  return (await db.query("insert into customers (name) values ('Invoice test') returning id"))
    .rows[0].id as string;
}

/** create_invoice as an operator; returns the row. */
async function invoice(db: Client, customerId: string, base: number | string) {
  const { rows } = await db.query(
    "select * from create_invoice($1, $2, '2031-01-01', '2031-01-15')",
    [customerId, base],
  );
  return rows[0];
}

// Unusual bases so real open invoices in a local database can never be in the way.
const BASE = 777_000_000;

describe("create_invoice", () => {
  it("numbers invoices INV-0001 … INV-9999, then INV-10000", async () => {
    await withRollback(async (db) => {
      const n = (x: number) =>
        db.query("select invoice_number($1) as n", [x]).then((r) => r.rows[0].n);
      expect(await n(1)).toBe("INV-0001");
      expect(await n(9999)).toBe("INV-9999");
      expect(await n(10000)).toBe("INV-10000");
      expect(await n(123456)).toBe("INV-123456");
    });
  });

  it("adds the smallest free code 1–999 and never repeats an amount that is still waiting", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await actAs(db, await createUser(db, "operator"));
      const a = await invoice(db, c, BASE);
      const b = await invoice(db, c, BASE);
      expect([a.unique_code, b.unique_code]).toEqual([1, 2]);
      expect(a.transfer_amount).toBe(String(BASE + 1));
      expect(a.number).toMatch(/^INV-\d{4,}$/);
      expect(a.status).toBe("open");

      // BASE+1 would ask for BASE+2, which invoice b already asks for → code 2 → BASE+3
      const c3 = await invoice(db, c, BASE + 1);
      expect(c3.transfer_amount).toBe(String(BASE + 3));
    });
  });

  it("a voided or paid invoice frees its amount", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await actAs(db, await createUser(db, "owner"));
      const a = await invoice(db, c, BASE);
      await db.query("select void_invoice($1, 'Wrong amount')", [a.id]);
      expect((await invoice(db, c, BASE)).unique_code).toBe(1);
    });
  });

  it("stores amounts beyond 2^53 exactly", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await actAs(db, await createUser(db, "owner"));
      const a = await invoice(db, c, "9007199254740000");
      expect(a.unique_amount).toBe("9007199254740001");
    });
  });

  it("rejects a due date before the issue date", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await actAs(db, await createUser(db, "owner"));
      const res = await tryQuery(
        db,
        "select create_invoice($1, 1000, '2031-02-01', '2031-01-01')",
        [c],
      );
      expect(res.error).toMatch(/check/);
    });
  });
});

describe("invoice permissions", () => {
  it("viewers can't create or void; nobody inserts directly or deletes", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await actAs(db, await createUser(db, "owner"));
      const inv = await invoice(db, c, BASE);

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "viewer"));
      expect(
        (await tryQuery(db, "select create_invoice($1, 1000, '2031-01-01', '2031-01-02')", [c]))
          .error,
      ).toMatch(/Not allowed/);
      expect((await tryQuery(db, "select void_invoice($1, 'x')", [inv.id])).error).toMatch(
        /Not allowed/,
      );

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "owner"));
      expect(
        (
          await tryQuery(
            db,
            "insert into invoices (number, customer_id, base_amount, unique_code, issued_on, due_on) values ('INV-X', $1, 1, 1, '2031-01-01', '2031-01-01')",
            [c],
          )
        ).error,
      ).toMatch(/permission denied/);
      expect((await tryQuery(db, "delete from invoices where id = $1", [inv.id])).error).toMatch(
        /permission denied/,
      );

      await actAsAdmin(db);
      expect((await tryQuery(db, "delete from invoices where id = $1", [inv.id])).error).toMatch(
        /not allowed/,
      );
    });
  });

  it("people can change the due date and notes, never the amount or status", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await actAs(db, await createUser(db, "operator"));
      const inv = await invoice(db, c, BASE);
      expect(
        (
          await tryQuery(
            db,
            "update invoices set due_on = '2031-02-01', notes = 'agreed' where id = $1",
            [inv.id],
          )
        ).rowCount,
      ).toBe(1);
      for (const sql of [
        "update invoices set base_amount = 1 where id = $1",
        "update invoices set transfer_amount = 1 where id = $1",
        "update invoices set status = 'paid' where id = $1",
      ]) {
        expect((await tryQuery(db, sql, [inv.id])).error).toMatch(/permission denied/);
      }
    });
  });

  it("voiding needs a reason and is audited with it", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      const inv = await invoice(db, c, BASE);
      expect((await tryQuery(db, "select void_invoice($1, '  ')", [inv.id])).error).toMatch(
        /Say why/,
      );
      await db.query("select void_invoice($1, 'Customer cancelled')", [inv.id]);
      expect((await tryQuery(db, "select void_invoice($1, 'again')", [inv.id])).error).toMatch(
        /Only an invoice still waiting/,
      );

      await actAsAdmin(db);
      const { rows } = await db.query(
        "select actor_id, reason, new_value from audit_log where record_id = $1 and action = 'update'",
        [inv.id],
      );
      expect(rows).toEqual([
        {
          actor_id: owner,
          reason: "Customer cancelled",
          new_value: {
            status: "void",
            transfer_amount: null,
            void_reason: "Customer cancelled",
            voided_at: expect.any(String), // stamped by the database
          },
        },
      ]);
    });
  });
});

describe("concurrency", () => {
  it("40 invoices created in parallel for the same amount never collide", async () => {
    // Each creation commits in its own connection, like 40 people clicking at once.
    const admin = new Client({ connectionString: DB_URL });
    await admin.connect();
    const customerId = (
      await admin.query("insert into customers (name) values ($1) returning id", [
        `Concurrency test ${randomUUID()}`,
      ])
    ).rows[0].id as string;
    const base = 888_000_000 + Math.floor(Math.random() * 1_000_000) * 1000;

    try {
      const results = await Promise.all(
        Array.from({ length: 40 }, async () => {
          const db = new Client({ connectionString: DB_URL });
          await db.connect();
          try {
            await db.query("set role service_role"); // the auto-invoicing job's identity
            const { rows } = await db.query(
              "select transfer_amount from create_invoice($1, $2, '2031-01-01', '2031-01-31')",
              [customerId, base],
            );
            return rows[0].transfer_amount as string;
          } finally {
            await db.end();
          }
        }),
      );
      expect(new Set(results).size).toBe(40);
      expect(results.map((r) => BigInt(r) - BigInt(base)).sort((a, b) => Number(a - b))).toEqual(
        Array.from({ length: 40 }, (_, i) => BigInt(i + 1)),
      );
    } finally {
      // Invoices can never be deleted; with triggers off for this session only, the test
      // removes what it made (and its audit rows) so the local database stays clean.
      await admin.query("set session_replication_role = replica");
      await admin.query(
        "delete from reminders where invoice_id in (select id from invoices where customer_id = $1)",
        [customerId],
      );
      await admin.query(
        "delete from audit_log where record_id in (select id::text from invoices where customer_id = $1) or record_id = $2",
        [customerId, customerId],
      );
      await admin.query("delete from invoices where customer_id = $1", [customerId]);
      await admin.query("delete from customers where id = $1", [customerId]);
      await admin.end();
    }
  });
});
