import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

const ADD_CUSTOMER =
  "insert into customers (name, whatsapp_number, billing_email) values ($1, $2, $3) returning id";

async function customer(db: Client) {
  return (await db.query(ADD_CUSTOMER, ["PT Test", "+6281200000000", "a@b.example"])).rows[0]
    .id as string;
}

const ADD_SUBSCRIPTION = `insert into subscriptions (customer_id, plan_name, price, cycle, start_date, next_invoice_date)
  values ($1, 'Starter', $2, $3, '2026-01-01', '2026-10-01') returning id`;

describe("customers", () => {
  it("stores WhatsApp numbers only in E.164", async () => {
    await withRollback(async (db) => {
      for (const ok of ["+6281234567890", "+14155552671", null]) {
        expect((await tryQuery(db, ADD_CUSTOMER, ["A", ok, null])).error).toBeNull();
      }
      for (const bad of [
        "081234567890",
        "6281234567890",
        "+62 812 3456 7890",
        "+0812345678",
        "+62",
      ]) {
        expect((await tryQuery(db, ADD_CUSTOMER, ["A", bad, null])).error).toMatch(/check/);
      }
    });
  });

  it("rejects blank names and malformed emails", async () => {
    await withRollback(async (db) => {
      expect((await tryQuery(db, ADD_CUSTOMER, ["  ", null, null])).error).toMatch(/check/);
      expect((await tryQuery(db, ADD_CUSTOMER, ["A", null, "not-an-email"])).error).toMatch(
        /check/,
      );
    });
  });

  it("owner and operator add and edit customers; viewers can't; nobody deletes", async () => {
    await withRollback(async (db) => {
      for (const [role, allowed] of [
        ["owner", true],
        ["operator", true],
        ["viewer", false],
      ] as const) {
        await actAsAdmin(db);
        await actAs(db, await createUser(db, role));
        const res = await tryQuery(db, ADD_CUSTOMER, [`By ${role}`, null, null]);
        expect(res.error === null, role).toBe(allowed);
      }
      await actAsAdmin(db);
      const id = await customer(db);
      await actAs(db, await createUser(db, "owner"));
      expect((await tryQuery(db, "delete from customers where id = $1", [id])).error).toMatch(
        /permission denied/,
      );
    });
  });

  it("changes are audited", async () => {
    await withRollback(async (db) => {
      const id = await customer(db);
      const operator = await createUser(db, "operator");
      await actAs(db, operator);
      await db.query("update customers set notes = 'Pays late' where id = $1", [id]);
      await actAsAdmin(db);
      const { rows } = await db.query(
        "select actor_id, new_value from audit_log where record_id = $1 and action = 'update'",
        [id],
      );
      expect(rows).toEqual([{ actor_id: operator, new_value: { notes: "Pays late" } }]);
    });
  });
});

describe("subscriptions", () => {
  it("validates price, cycle, status and dates", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      expect((await tryQuery(db, ADD_SUBSCRIPTION, [c, 1_500_000, "monthly"])).error).toBeNull();
      expect((await tryQuery(db, ADD_SUBSCRIPTION, [c, 0, "monthly"])).error).toMatch(/check/);
      expect((await tryQuery(db, ADD_SUBSCRIPTION, [c, 1000, "weekly"])).error).toMatch(/check/);
      const { error } = await tryQuery(
        db,
        `insert into subscriptions (customer_id, plan_name, price, cycle, start_date, end_date, next_invoice_date)
         values ($1, 'X', 1000, 'monthly', '2026-05-01', '2026-04-01', '2026-05-01')`,
        [c],
      );
      expect(error).toMatch(/check/);
    });
  });

  it("stores prices beyond 2^53 exactly", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await db.query(ADD_SUBSCRIPTION, [c, "9007199254740993", "yearly"]);
      const { rows } = await db.query(
        "select price::text from subscriptions where customer_id = $1",
        [c],
      );
      expect(rows[0].price).toBe("9007199254740993");
    });
  });

  it("only the owner creates or changes subscriptions", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      const sub = (await db.query(ADD_SUBSCRIPTION, [c, 1000, "monthly"])).rows[0].id;
      await actAs(db, await createUser(db, "operator"));
      expect((await tryQuery(db, ADD_SUBSCRIPTION, [c, 1000, "monthly"])).error).toMatch(
        /row-level security/,
      );
      expect(
        (await tryQuery(db, "update subscriptions set price = 1 where id = $1", [sub])).rowCount,
      ).toBe(0);

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "owner"));
      expect(
        (await tryQuery(db, "update subscriptions set price = 2000 where id = $1", [sub])).rowCount,
      ).toBe(1);
    });
  });

  it("a customer with subscriptions can't be deleted", async () => {
    await withRollback(async (db) => {
      const c = await customer(db);
      await db.query(ADD_SUBSCRIPTION, [c, 1000, "monthly"]);
      expect((await tryQuery(db, "delete from customers where id = $1", [c])).error).toMatch(
        /foreign key/,
      );
    });
  });
});
