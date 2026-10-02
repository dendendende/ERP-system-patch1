import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

async function invoiceId(db: Client) {
  const customer = (
    await db.query("insert into customers (name) values ('Reminder test') returning id")
  ).rows[0].id as string;
  await db.query("set local role service_role");
  const { rows } = await db.query(
    "select id from create_invoice($1, 443000000, jakarta_today(), jakarta_today() + 14)",
    [customer],
  );
  await actAsAdmin(db);
  // a new bill queues its own reminders (P3-T2); these tests add their own by hand
  await db.query("delete from reminders where invoice_id = $1", [rows[0].id]);
  return rows[0].id as string;
}

const scheduleId = async (db: Client, offset: number) =>
  (await db.query("select id from reminder_schedule where offset_days = $1 limit 1", [offset]))
    .rows[0].id as string;

const ADD_REMINDER = `insert into reminders (invoice_id, schedule_id, channel, scheduled_for, status, sent_at)
  values ($1, $2, $3, now(), $4, $5)`;

describe("the reminder schedule", () => {
  it("starts with the default steps", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        "select offset_days, kind, channels from reminder_schedule where is_active order by offset_days, kind",
      );
      expect(rows.map((r) => [r.offset_days, r.kind])).toEqual([
        [-14, "invoice"],
        [-7, "reminder"],
        [-1, "due_tomorrow"],
        [3, "overdue"],
        [7, "overdue"],
        [14, "escalate_team"],
      ]);
      // escalation is for the team only, every other step reaches the customer
      for (const r of rows) {
        expect(r.channels.length === 0).toBe(r.kind === "escalate_team");
      }
    });
  });

  it("refuses unknown channels, and customer steps with no way to reach them", async () => {
    await withRollback(async (db) => {
      const add = "insert into reminder_schedule (offset_days, kind, channels, template_key) values ($1, $2, $3, 'x')";
      expect((await tryQuery(db, add, [2, "overdue", ["sms"]])).error).toMatch(/check/);
      expect((await tryQuery(db, add, [2, "overdue", []])).error).toMatch(/check/);
      expect((await tryQuery(db, add, [20, "escalate_team", ["email"]])).error).toMatch(/check/);
      expect((await tryQuery(db, add, [99, "overdue", ["email"]])).error).toMatch(/check/);
      expect((await tryQuery(db, add, [2, "overdue", ["email"]])).error).toBeNull();
    });
  });

  it("only the owner changes it, and changes are audited", async () => {
    await withRollback(async (db) => {
      const step = await scheduleId(db, -7);
      await actAs(db, await createUser(db, "operator"));
      expect(
        (await tryQuery(db, "update reminder_schedule set is_active = false where id = $1", [step]))
          .rowCount,
      ).toBe(0);

      await actAsAdmin(db);
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      expect(
        (await tryQuery(db, "update reminder_schedule set is_active = false where id = $1", [step]))
          .rowCount,
      ).toBe(1);
      expect((await tryQuery(db, "delete from reminder_schedule where id = $1", [step])).error).toMatch(
        /permission denied/,
      );

      await actAsAdmin(db);
      const { rows } = await db.query(
        "select actor_id, new_value from audit_log where record_id = $1 and action = 'update' and actor_id = $2",
        [step, owner],
      );
      expect(rows).toEqual([{ actor_id: owner, new_value: { is_active: false } }]);
    });
  });
});

describe("reminders", () => {
  it("one per invoice, step and channel — a second one is refused", async () => {
    await withRollback(async (db) => {
      const inv = await invoiceId(db);
      const step = await scheduleId(db, -14);
      await db.query(ADD_REMINDER, [inv, step, "whatsapp", "scheduled", null]);
      await db.query(ADD_REMINDER, [inv, step, "email", "scheduled", null]);
      expect(
        (await tryQuery(db, ADD_REMINDER, [inv, step, "whatsapp", "scheduled", null])).error,
      ).toMatch(/reminders_once/);
    });
  });

  it("sent_at matches the status", async () => {
    await withRollback(async (db) => {
      const inv = await invoiceId(db);
      const step = await scheduleId(db, -14);
      const at = new Date().toISOString();
      expect((await tryQuery(db, ADD_REMINDER, [inv, step, "whatsapp", "sent", null])).error).toMatch(
        /check/,
      );
      expect((await tryQuery(db, ADD_REMINDER, [inv, step, "whatsapp", "scheduled", at])).error).toMatch(
        /check/,
      );
      expect((await tryQuery(db, ADD_REMINDER, [inv, step, "whatsapp", "delivered", at])).error).toBeNull();
      expect((await tryQuery(db, ADD_REMINDER, [inv, step, "email", "failed", null])).error).toBeNull();
    });
  });

  it("the team reads reminders; nobody writes them but the jobs", async () => {
    await withRollback(async (db) => {
      const inv = await invoiceId(db);
      const step = await scheduleId(db, -14);
      await db.query(ADD_REMINDER, [inv, step, "whatsapp", "scheduled", null]);

      await actAs(db, await createUser(db, "viewer"));
      expect(
        (await db.query("select 1 from reminders where invoice_id = $1", [inv])).rowCount,
      ).toBe(1);

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "owner"));
      for (const sql of [
        "update reminders set status = 'cancelled' where invoice_id = $1",
        "delete from reminders where invoice_id = $1",
      ]) {
        expect((await tryQuery(db, sql, [inv])).error).toMatch(/permission denied/);
      }
      expect(
        (await tryQuery(db, ADD_REMINDER, [inv, step, "email", "scheduled", null])).error,
      ).toMatch(/permission denied/);
    });
  });
});
