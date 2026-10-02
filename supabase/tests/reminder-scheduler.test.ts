import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function customer(db: Client) {
  return (
    await db.query("insert into customers (name) values ($1) returning id", [
      `Scheduler test ${randomUUID()}`,
    ])
  ).rows[0].id as string;
}

/** An invoice due `dueInDays` from today (Jakarta), written by the invoicing job. */
async function invoice(db: Client, customerId: string, dueInDays: number) {
  await db.query("set local role service_role");
  const { rows } = await db.query(
    "select id from create_invoice($1, 557000000, jakarta_today() - 30, jakarta_today() + $2::int)",
    [customerId, dueInDays],
  );
  await actAsAdmin(db);
  return rows[0].id as string;
}

async function queued(db: Client, invoiceId: string) {
  const { rows } = await db.query(
    `select s.offset_days, r.channel, r.status,
            to_char(r.scheduled_for at time zone 'Asia/Jakarta', 'HH24:MI') as jakarta_time,
            ((r.scheduled_for at time zone 'Asia/Jakarta')::date - jakarta_today()) as in_days
       from reminders r join reminder_schedule s on s.id = r.schedule_id
      where r.invoice_id = $1
      order by s.offset_days, r.channel`,
    [invoiceId],
  );
  return rows as {
    offset_days: number;
    channel: string;
    status: string;
    jakarta_time: string;
    in_days: number;
  }[];
}

const asSender = async <T>(db: Client, sql: string, params: unknown[] = []) => {
  await db.query("set local role service_role");
  const { rows } = await db.query(sql, params);
  await actAsAdmin(db);
  return rows as T[];
};

describe("queueing reminders", () => {
  it("a new bill gets one reminder per step and channel, at 08:00 Jakarta on the step's day", async () => {
    await withRollback(async (db) => {
      const inv = await invoice(db, await customer(db), 20);
      expect(await queued(db, inv)).toEqual([
        { offset_days: -14, channel: "email", status: "scheduled", jakarta_time: "08:00", in_days: 6 },
        { offset_days: -7, channel: "email", status: "scheduled", jakarta_time: "08:00", in_days: 13 },
        { offset_days: -1, channel: "email", status: "scheduled", jakarta_time: "08:00", in_days: 19 },
        { offset_days: 3, channel: "email", status: "scheduled", jakarta_time: "08:00", in_days: 23 },
        { offset_days: 7, channel: "email", status: "scheduled", jakarta_time: "08:00", in_days: 27 },
      ]);
    });
  });

  it("a step with two channels queues one reminder on each", async () => {
    await withRollback(async (db) => {
      await db.query(
        "update reminder_schedule set channels = array['whatsapp', 'email'] where offset_days = 3",
      );
      const inv = await invoice(db, await customer(db), 20);
      const late = (await queued(db, inv)).filter((r) => r.offset_days === 3);
      expect(late.map((r) => r.channel)).toEqual(["email", "whatsapp"]);
    });
  });

  it("a bill written late skips steps already past, but the bill itself still goes out now", async () => {
    await withRollback(async (db) => {
      const inv = await invoice(db, await customer(db), 5);
      const rows = await queued(db, inv);
      expect(rows.map((r) => r.offset_days)).toEqual([-14, -1, 3, 7]);
      const bill = rows.filter((r) => r.offset_days === -14);
      expect(bill.every((r) => r.in_days === 0)).toBe(true); // today, i.e. the next run
    });
  });

  it("switched-off steps are not queued", async () => {
    await withRollback(async (db) => {
      await db.query("update reminder_schedule set is_active = false where offset_days = -7");
      const inv = await invoice(db, await customer(db), 20);
      expect((await queued(db, inv)).some((r) => r.offset_days === -7)).toBe(false);
    });
  });

  it("moving the due date moves the reminders that haven't gone out", async () => {
    await withRollback(async (db) => {
      const inv = await invoice(db, await customer(db), 20);
      await db.query("update invoices set due_on = due_on + 10 where id = $1", [inv]);
      const rows = await queued(db, inv);
      expect(rows.find((r) => r.offset_days === -1)?.in_days).toBe(29);

      // moved so early that the −7 step is now in the past: dropped, not sent in a burst
      await db.query("update invoices set due_on = jakarta_today() + 3 where id = $1", [inv]);
      const after = await queued(db, inv);
      expect(after.find((r) => r.offset_days === -7)?.status).toBe("cancelled");
      expect(after.find((r) => r.offset_days === -1)).toMatchObject({ status: "scheduled", in_days: 2 });
    });
  });
});

describe("sending exactly once", () => {
  it("due reminders are handed out once; asking again gets nothing", async () => {
    await withRollback(async (db) => {
      const inv = await invoice(db, await customer(db), 5); // its bill message is due now
      const first = await asSender<{ id: string; invoice_id: string }>(
        db,
        "select * from claim_due_reminders(1000)",
      );
      const mine = first.filter((r) => r.invoice_id === inv);
      expect(mine).toHaveLength(1); // the bill, by email
      const second = await asSender<{ invoice_id: string }>(db, "select * from claim_due_reminders(1000)");
      expect(second.filter((r) => r.invoice_id === inv)).toEqual([]);
    });
  });

  it("a result is recorded once; a second report changes nothing", async () => {
    await withRollback(async (db) => {
      const inv = await invoice(db, await customer(db), 5);
      const [r] = (await asSender<{ id: string; invoice_id: string }>(
        db,
        "select * from claim_due_reminders(1000)",
      )).filter((x) => x.invoice_id === inv);
      const record = "select record_reminder_result($1, $2, $3, $4, $5) as ok";
      expect((await asSender<{ ok: boolean }>(db, record, [r.id, true, "wamid.1", "557000001", null]))[0].ok).toBe(true);
      expect((await asSender<{ ok: boolean }>(db, record, [r.id, false, null, null, "late failure"]))[0].ok).toBe(false);

      const { rows } = await db.query(
        "select status, provider_message_id, amount_shown::text, sent_at is not null as has_sent_at from reminders where id = $1",
        [r.id],
      );
      expect(rows[0]).toEqual({
        status: "sent",
        provider_message_id: "wamid.1",
        amount_shown: "557000001",
        has_sent_at: true,
      });
    });
  });

  it("a claim nobody finished is marked failed after 30 minutes, never sent again", async () => {
    await withRollback(async (db) => {
      const inv = await invoice(db, await customer(db), 5);
      await asSender(db, "select * from claim_due_reminders(1000)");
      await db.query(
        "update reminders set claimed_at = now() - interval '31 minutes' where invoice_id = $1",
        [inv],
      );
      await asSender(db, "select fail_stale_reminder_claims()");
      const { rows } = await db.query("select distinct status from reminders where invoice_id = $1 and claimed_at is not null", [inv]);
      expect(rows).toEqual([{ status: "failed" }]);
      const again = await asSender<{ invoice_id: string }>(db, "select * from claim_due_reminders(1000)");
      expect(again.filter((r) => r.invoice_id === inv)).toEqual([]);
    });
  });

  it("only the sender may claim or record", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "owner"));
      for (const sql of [
        "select * from claim_due_reminders()",
        "select fail_stale_reminder_claims()",
        `select record_reminder_result('${randomUUID()}', true)`,
      ]) {
        expect((await tryQuery(db, sql)).error).toMatch(/permission denied/);
      }
    });
  });

  it("two senders running at the same moment never get the same reminder", async () => {
    // Real concurrency needs committed data and separate connections.
    const admin = new Client({ connectionString: DB_URL });
    await admin.connect();
    const customerId = await customer(admin);
    const invoiceIds: string[] = [];
    try {
      for (let i = 0; i < 10; i++) {
        await admin.query("begin");
        invoiceIds.push(await invoice(admin, customerId, 5));
        await admin.query("commit");
      }
      // Each sender claims inside a transaction it keeps open, so its row locks stay held while
      // the others claim; then all roll back — no claim is left behind on anyone's reminders.
      const senders = await Promise.all(
        Array.from({ length: 6 }, async () => {
          const db = new Client({ connectionString: DB_URL });
          await db.connect();
          await db.query("begin");
          await db.query("set local role service_role");
          return db;
        }),
      );
      let results: string[][];
      try {
        results = await Promise.all(
          senders.map(async (db) => {
            const { rows } = await db.query("select id, invoice_id from claim_due_reminders(1000)");
            return (rows as { id: string; invoice_id: string }[])
              .filter((r) => invoiceIds.includes(r.invoice_id))
              .map((r) => r.id);
          }),
        );
      } finally {
        await Promise.all(senders.map((db) => db.query("rollback").then(() => db.end())));
      }
      const all = results.flat();
      expect(all).toHaveLength(10); // 10 bills, one email each
      expect(new Set(all).size).toBe(all.length); // nobody got the same one twice
    } finally {
      // Bills and reminders can't be deleted normally; with triggers off for this session only,
      // the test removes what it made so the local database stays clean.
      await admin.query("set session_replication_role = replica");
      await admin.query("delete from reminders where invoice_id = any($1::uuid[])", [invoiceIds]);
      await admin.query(
        "delete from audit_log where record_id = any($1::text[]) or record_id = $2",
        [invoiceIds, customerId],
      );
      await admin.query("delete from invoices where id = any($1::uuid[])", [invoiceIds]);
      await admin.query("delete from customers where id = $1", [customerId]);
      await admin.end();
    }
  });
});
