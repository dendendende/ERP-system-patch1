import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

let n = 0;

async function setup(db: Client, dueInDays = 10) {
  await db.query("update bank_accounts set is_active = false");
  await db.query(
    `insert into bank_accounts (bank_name, account_name, account_last4, source, last_synced_at)
     values ('BCA', 'T', '0015', 'aggregator', now() - interval '1 day')`,
  );
  const customer = (
    await db.query("insert into customers (name, billing_email) values ($1, 'ap@x.example') returning id", [
      `PT Manual ${++n}`,
    ])
  ).rows[0].id as string;
  const operator = await createUser(db, "operator");
  await actAs(db, operator);
  const inv = (
    await db.query(
      "select id from create_invoice($1, 756000000, jakarta_today() - 20, (jakarta_today() + $2::int)::date)",
      [customer, dueInDays],
    )
  ).rows[0].id as string;
  await actAsAdmin(db);
  // nothing due until a test says so (a new bill's own message is otherwise due right away)
  await db.query("update reminders set scheduled_for = now() + interval '30 days' where invoice_id = $1", [inv]);
  return { customer, operator, inv };
}

/** Make the reminder for step `offset` due now (and, optionally, an older step due earlier). */
async function due(db: Client, inv: string, offset: number, minutesAgo = 1) {
  const { rows } = await db.query(
    `update reminders r set scheduled_for = now() - make_interval(mins => $3)
       from reminder_schedule s
      where s.id = r.schedule_id and r.invoice_id = $1 and s.offset_days = $2
      returning r.id`,
    [inv, offset, minutesAgo],
  );
  return rows[0].id as string;
}

const onList = async (db: Client, inv: string) =>
  (await db.query("select reminder_id, kind, template_key, waiting_for_bank from reminders_to_send where invoice_id = $1", [inv]))
    .rows;

describe("the team's list of reminders to send", () => {
  it("shows a due reminder, one line per bill (the latest)", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      expect(await onList(db, s.inv)).toEqual([]); // nothing due yet
      const older = await due(db, s.inv, -14, 60);
      const latest = await due(db, s.inv, -7, 1);
      expect(await onList(db, s.inv)).toEqual([
        { reminder_id: latest, kind: "reminder", template_key: "reminder", waiting_for_bank: false },
      ]);
      expect(older).not.toBe(latest);
    });
  });

  it("marking it sent records who and the amount asked for, and closes the older one it replaced", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const older = await due(db, s.inv, -14, 60);
      const latest = await due(db, s.inv, -7, 1);
      await actAs(db, s.operator);
      await db.query("select close_reminder($1, true)", [latest]);
      await actAsAdmin(db);

      const { rows } = await db.query(
        "select id, status, sent_by, amount_shown is not null as has_amount, error from reminders where id = any($1::uuid[]) order by scheduled_for",
        [[older, latest]],
      );
      expect(rows).toEqual([
        { id: older, status: "cancelled", sent_by: null, has_amount: false, error: "Replaced by a later reminder" },
        { id: latest, status: "sent", sent_by: s.operator, has_amount: true, error: null },
      ]);
      expect(await onList(db, s.inv)).toEqual([]);

      // it can't be sent twice
      await actAs(db, s.operator);
      expect((await tryQuery(db, "select close_reminder($1, true)", [latest])).error).toMatch(
        /already dealt with/,
      );
    });
  });

  it("skipping takes it off the list without sending", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const r = await due(db, s.inv, -7);
      await actAs(db, s.operator);
      await db.query("select close_reminder($1, false)", [r]);
      await actAsAdmin(db);
      expect((await db.query("select status, error from reminders where id = $1", [r])).rows[0]).toEqual({
        status: "cancelled",
        error: "Skipped by someone on the team",
      });
    });
  });

  it("stop rules: paid → off the list and a thank-you instead; paused → hidden", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await due(db, s.inv, -7);
      await db.query("update customers set reminders_paused = true where id = $1", [s.customer]);
      expect(await onList(db, s.inv)).toEqual([]);
      await db.query("update customers set reminders_paused = false where id = $1", [s.customer]);

      const tx = (
        await db.query(
          `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
           select id, 'manual-${n}', now(), 756000001, 'in', 'TRSF' from bank_accounts where is_active returning id`,
        )
      ).rows[0].id;
      await actAs(db, s.operator);
      await db.query("select apply_payment($1, $2, 756000001)", [s.inv, tx]);
      await actAsAdmin(db);
      expect((await onList(db, s.inv)).map((r) => r.template_key)).toEqual(["thank_you"]);
    });
  });

  it("a late notice is flagged until the bank has been read after it was due", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db, -3);
      await due(db, s.inv, 3);
      expect(await onList(db, s.inv)).toMatchObject([{ kind: "overdue", waiting_for_bank: true }]);
      await db.query("update bank_accounts set last_synced_at = now() + interval '1 second' where is_active");
      expect(await onList(db, s.inv)).toMatchObject([{ kind: "overdue", waiting_for_bank: false }]);
    });
  });

  it("viewers see the list but can't mark anything", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      const r = await due(db, s.inv, -7);
      await actAs(db, await createUser(db, "viewer"));
      expect(await onList(db, s.inv)).toHaveLength(1);
      expect((await tryQuery(db, "select close_reminder($1, true)", [r])).error).toMatch(/Not allowed/);
    });
  });
});

describe("sending by hand, many times", () => {
  it("two reminders for two bills can both be marked sent", async () => {
    await withRulesOff(async (db) => {
      const a = await setup(db);
      const b = await setup(db);
      const ra = await due(db, a.inv, -7);
      const rb = await due(db, b.inv, -7);
      await actAs(db, a.operator);
      await db.query("select close_reminder($1, true)", [ra]);
      await db.query("select close_reminder($1, true)", [rb]);
      await actAsAdmin(db);
      const { rows } = await db.query(
        "select count(*)::int as n from reminders where id = any($1::uuid[]) and status = 'sent' and sent_by is not null",
        [[ra, rb]],
      );
      expect(rows[0].n).toBe(2);
    });
  });
});
