import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

// P6-T3c: customer phone numbers and emails only for the people who contact customers.
describe("personal data by role", () => {
  it("owner and operator see a customer's phone and email; a viewer sees the customer, not those", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `insert into customers (name, whatsapp_number, billing_email)
         values ('PDP Test', '+6281234567890', 'finance@pdp.example') returning id`,
      );
      const id = rows[0].id;
      const contacts = async () =>
        (await db.query("select * from public.customer_contacts() where customer_id = $1", [id]))
          .rows;

      for (const role of ["owner", "operator"] as const) {
        await actAsAdmin(db);
        await actAs(db, await createUser(db, role));
        expect(await contacts()).toEqual([
          {
            customer_id: id,
            whatsapp_number: "+6281234567890",
            billing_email: "finance@pdp.example",
          },
        ]);
      }

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "viewer"));
      expect(await contacts()).toEqual([]);
      expect((await db.query("select name from customers where id = $1", [id])).rows).toEqual([
        { name: "PDP Test" },
      ]);
      expect((await tryQuery(db, "select billing_email from customers")).error).toMatch(
        /permission denied/,
      );
      expect((await tryQuery(db, "select whatsapp_number from customers")).error).toMatch(
        /permission denied/,
      );
    });
  });

  it("the team lists hide contacts from viewers too", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "viewer"));
      for (const view of ["team_escalations", "reminders_to_send"]) {
        const { rows } = await db.query(
          `select count(*)::int n from ${view} where phone is not null or email is not null`,
        );
        expect(rows[0].n, view).toBe(0);
      }
    });
  });

  it("the team can read every customer column except the two contact ones", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'customers'
            and not has_column_privilege('authenticated', 'public.customers', column_name, 'select')
          order by 1`,
      );
      expect(rows.map((r) => r.column_name)).toEqual(["billing_email", "whatsapp_number"]);
    });
  });

  it("only the owner reads change history that holds contact details", async () => {
    await withRollback(async (db) => {
      await db.query(
        "insert into customers (name, billing_email) values ('PDP Audit', 'a@pdp.example')",
      );
      const count = async () =>
        (await db.query("select count(*)::int n from audit_log where table_name = 'customers'"))
          .rows[0].n;

      await actAs(db, await createUser(db, "owner"));
      expect(await count()).toBeGreaterThan(0);
      for (const role of ["operator", "viewer"] as const) {
        await actAsAdmin(db);
        await actAs(db, await createUser(db, role));
        expect(await count(), role).toBe(0);
      }
    });
  });
});
