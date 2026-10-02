import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRollback } from "./db";

async function bill(db: Client, dueInDays: number) {
  const customer = (
    await db.query("insert into customers (name, billing_email) values ('PT Schedule', 'a@b.example') returning id")
  ).rows[0].id as string;
  await db.query("set local role service_role");
  const { rows } = await db.query(
    "select id from create_invoice($1, 734000000, jakarta_today() - 1, (jakarta_today() + $2::int)::date)",
    [customer, dueInDays],
  );
  await actAsAdmin(db);
  return rows[0].id as string;
}

async function step(db: Client, offset: number) {
  return (await db.query("select id from reminder_schedule where offset_days = $1 limit 1", [offset]))
    .rows[0].id as string;
}

async function reminderAt(db: Client, inv: string, stepId: string, channel = "email") {
  const { rows } = await db.query(
    `select status, error,
            ((scheduled_for at time zone 'Asia/Jakarta')::date - jakarta_today()) as in_days
       from reminders where invoice_id = $1 and schedule_id = $2 and channel = $3`,
    [inv, stepId, channel],
  );
  return rows[0] as { status: string; error: string | null; in_days: number } | undefined;
}

/** Change the schedule as the owner (the way the settings page does). */
async function asOwner(db: Client, sql: string, params: unknown[]) {
  await actAs(db, await createUser(db, "owner"));
  await db.query(sql, params);
  await actAsAdmin(db);
}

describe("changing the schedule", () => {
  it("moving a step moves the reminders not yet sent", async () => {
    await withRollback(async (db) => {
      const inv = await bill(db, 20);
      const s = await step(db, -7);
      expect(await reminderAt(db, inv, s)).toMatchObject({ status: "scheduled", in_days: 13 });
      await asOwner(db, "update reminder_schedule set offset_days = -5 where id = $1", [s]);
      expect(await reminderAt(db, inv, s)).toMatchObject({ status: "scheduled", in_days: 15 });
    });
  });

  it("never touches a reminder that was already sent", async () => {
    await withRollback(async (db) => {
      const inv = await bill(db, 20);
      const s = await step(db, -7);
      await db.query(
        "update reminders set status = 'sent', sent_at = now(), claimed_at = now() where invoice_id = $1 and schedule_id = $2",
        [inv, s],
      );
      await asOwner(db, "update reminder_schedule set offset_days = -5, is_active = false where id = $1", [s]);
      expect(await reminderAt(db, inv, s)).toMatchObject({ status: "sent", in_days: 13 });
    });
  });

  it("switching a step off cancels what's queued; switching it back on brings it back", async () => {
    await withRollback(async (db) => {
      const inv = await bill(db, 20);
      const s = await step(db, -1);
      await asOwner(db, "update reminder_schedule set is_active = false where id = $1", [s]);
      expect(await reminderAt(db, inv, s)).toEqual({
        status: "cancelled",
        error: "The reminder schedule changed",
        in_days: 19,
      });
      await asOwner(db, "update reminder_schedule set is_active = true where id = $1", [s]);
      expect(await reminderAt(db, inv, s)).toMatchObject({ status: "scheduled", error: null, in_days: 19 });
    });
  });

  it("adding a channel queues it for bills still waiting; removing it cancels it", async () => {
    await withRollback(async (db) => {
      const inv = await bill(db, 20);
      const s = await step(db, 3);
      await asOwner(db, "update reminder_schedule set channels = array['email', 'whatsapp'] where id = $1", [s]);
      expect(await reminderAt(db, inv, s, "whatsapp")).toMatchObject({ status: "scheduled", in_days: 23 });
      await asOwner(db, "update reminder_schedule set channels = array['email'] where id = $1", [s]);
      expect(await reminderAt(db, inv, s, "whatsapp")).toMatchObject({ status: "cancelled" });
      expect(await reminderAt(db, inv, s, "email")).toMatchObject({ status: "scheduled" });
    });
  });

  it("moving a step into the past drops its queued reminder instead of sending it at once", async () => {
    await withRollback(async (db) => {
      const inv = await bill(db, 5);
      const s = await step(db, -1); // day 4 from now
      await asOwner(db, "update reminder_schedule set offset_days = -10 where id = $1", [s]); // 5 days ago
      expect(await reminderAt(db, inv, s)).toMatchObject({
        status: "cancelled",
        error: "The reminder schedule changed",
      });
    });
  });

  it("paid or cancelled bills get nothing new", async () => {
    await withRollback(async (db) => {
      const inv = await bill(db, 20);
      await db.query("update invoices set status = 'void', transfer_amount = null, void_reason = 'x' where id = $1", [inv]);
      const s = await step(db, 3);
      await asOwner(db, "update reminder_schedule set channels = array['email', 'whatsapp'] where id = $1", [s]);
      expect(await reminderAt(db, inv, s, "whatsapp")).toBeUndefined();
    });
  });
});
