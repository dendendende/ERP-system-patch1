import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

async function setup(db: Client, dueInDays = 10) {
  await db.query("update bank_accounts set is_active = false");
  await db.query(
    `insert into bank_accounts (bank_name, account_name, account_last4, source, last_synced_at)
     values ('BCA', 'T', '0013', 'aggregator', now() - interval '1 day')`,
  );
  const customer = (
    await db.query(
      "insert into customers (name, billing_email) values ('PT Controls', 'ap@controls.example') returning id",
    )
  ).rows[0].id as string;
  const operator = await createUser(db, "operator");
  await actAs(db, operator);
  const inv = (
    await db.query(
      "select id from create_invoice($1, 718000000, jakarta_today() - 20, (jakarta_today() + $2::int)::date)",
      [customer, dueInDays],
    )
  ).rows[0].id as string;
  await actAsAdmin(db);
  // only what these tests queue by hand should be due
  await db.query("update reminders set scheduled_for = now() + interval '30 days' where invoice_id = $1", [inv]);
  return { customer, operator, inv };
}

async function claim(db: Client, inv: string) {
  await db.query("set local role service_role");
  const { rows } = await db.query("select * from claim_due_reminders(1000)");
  await actAsAdmin(db);
  return (rows as Record<string, string>[]).filter((r) => r.invoice_id === inv);
}

describe("send a reminder now", () => {
  it("queues one email, goes out on the next run, and remembers who asked", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await actAs(db, s.operator);
      const { rows } = await db.query("select send_reminder_now($1) as id", [s.inv]);
      await actAsAdmin(db);
      const queued = (
        await db.query("select channel, template_key, created_by from reminders where id = $1", [rows[0].id])
      ).rows[0];
      expect(queued).toEqual({ channel: "email", template_key: "reminder", created_by: s.operator });
      expect((await claim(db, s.inv)).map((r) => r.template_key)).toEqual(["reminder"]);
    });
  });

  it("at most once a day per bill", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await actAs(db, s.operator);
      await db.query("select send_reminder_now($1)", [s.inv]);
      expect((await tryQuery(db, "select send_reminder_now($1)", [s.inv])).error).toMatch(
        /already went out today/,
      );
    });
  });

  it("a late bill gets the late notice, which still waits for a bank read (rule 3)", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db, -5);
      await actAs(db, s.operator);
      await db.query("select send_reminder_now($1)", [s.inv]);
      await actAsAdmin(db);
      expect(await claim(db, s.inv)).toEqual([]); // bank last read yesterday
      // the next sync (inside one test transaction "now" never moves, so a second later)
      await db.query("update bank_accounts set last_synced_at = now() + interval '1 second' where is_active");
      expect((await claim(db, s.inv)).map((r) => r.template_key)).toEqual(["overdue"]);
    });
  });

  it("refused for viewers, paused customers, paid bills and customers without email", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await actAs(db, await createUser(db, "viewer"));
      expect((await tryQuery(db, "select send_reminder_now($1)", [s.inv])).error).toMatch(/Not allowed/);

      await actAsAdmin(db);
      await db.query("update customers set billing_email = null where id = $1", [s.customer]);
      await actAs(db, s.operator);
      expect((await tryQuery(db, "select send_reminder_now($1)", [s.inv])).error).toMatch(/no email address/);

      await actAsAdmin(db);
      await db.query("update customers set reminders_paused = true where id = $1", [s.customer]);
      await actAs(db, s.operator);
      expect((await tryQuery(db, "select send_reminder_now($1)", [s.inv])).error).toMatch(/paused/);

      await db.query("select void_invoice($1, 'test')", [s.inv]);
      expect((await tryQuery(db, "select send_reminder_now($1)", [s.inv])).error).toMatch(
        /not waiting for money/,
      );
    });
  });

  it("a queued 'send now' is cancelled if the bill is paid first", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await actAs(db, s.operator);
      const { rows } = await db.query("select send_reminder_now($1) as id", [s.inv]);
      await actAsAdmin(db);
      await db.query("alter table invoices disable trigger stop_reminders");
      await db.query("update invoices set status = 'paid', transfer_amount = null where id = $1", [s.inv]);
      expect(await claim(db, s.inv)).toEqual([]);
      const r = (await db.query("select status, error from reminders where id = $1", [rows[0].id])).rows[0];
      expect(r).toEqual({ status: "cancelled", error: "The bill was paid" });
    });
  });
});

describe("pause reminders", () => {
  it("pausing needs a reason, and pausing and resuming are audited with who and why", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await actAs(db, s.operator);
      expect(
        (await tryQuery(db, "select set_reminders_paused($1, true, '  ')", [s.customer])).error,
      ).toMatch(/Say why/);
      await db.query("select set_reminders_paused($1, true, 'Negotiating a new contract')", [s.customer]);
      await db.query("select set_reminders_paused($1, false, '')", [s.customer]);

      await actAsAdmin(db);
      const { rows } = await db.query(
        `select actor_id, reason, new_value from audit_log
          where record_id = $1 and action = 'update' order by id`,
        [s.customer],
      );
      expect(rows).toEqual([
        { actor_id: s.operator, reason: "Negotiating a new contract", new_value: { reminders_paused: true } },
        { actor_id: s.operator, reason: "Resumed", new_value: { reminders_paused: false } },
      ]);
    });
  });

  it("viewers can't pause", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await actAs(db, await createUser(db, "viewer"));
      expect(
        (await tryQuery(db, "select set_reminders_paused($1, true, 'x')", [s.customer])).error,
      ).toMatch(/Not allowed/);
    });
  });
});
