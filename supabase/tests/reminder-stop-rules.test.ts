import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

const BASE = 689_000_000n;
let seq = 0;

/**
 * A customer, one bank account we control (all others switched off for this test), and an
 * invoice due `dueInDays` from today. Its reminders are pushed far into the future, except the
 * step with `offset`, which is made due right now.
 */
async function setup(db: Client, { dueInDays = -3, offset = 3 } = {}) {
  await db.query("update bank_accounts set is_active = false");
  const account = (
    await db.query(
      `insert into bank_accounts (bank_name, account_name, account_last4, source, last_synced_at)
       values ('BCA', 'T', '0012', 'aggregator', now() - interval '1 day') returning id`,
    )
  ).rows[0].id as string;
  const customer = (
    await db.query("insert into customers (name) values ('PT Stop Rules') returning id")
  ).rows[0].id as string;
  const operator = await createUser(db, "operator");
  const owner = await createUser(db, "owner");

  await actAs(db, operator);
  const inv = (
    await db.query(
      `select id, transfer_amount::text from create_invoice($1, $2, jakarta_today() - 20,
         (jakarta_today() + $3::int)::date)`,
      [customer, BASE.toString(), dueInDays],
    )
  ).rows[0] as { id: string; transfer_amount: string };
  await actAsAdmin(db);

  await db.query(
    `update reminders r set scheduled_for = case when s.offset_days = $2
                                                 then now() - interval '1 minute'
                                                 else now() + interval '30 days' end
       from reminder_schedule s
      where s.id = r.schedule_id and r.invoice_id = $1`,
    [inv.id, offset],
  );
  return { account, customer, operator, owner, inv };
}

/** Run the sender's claim; return what it handed out for this invoice. */
async function claim(db: Client, invoiceId: string) {
  await db.query("set local role service_role");
  const { rows } = await db.query("select * from claim_due_reminders(1000)");
  await actAsAdmin(db);
  return (rows as Record<string, string>[]).filter((r) => r.invoice_id === invoiceId);
}

async function reminders(db: Client, invoiceId: string) {
  const { rows } = await db.query(
    `select coalesce(r.template_key, s.kind || ' ' || s.offset_days) as what, r.channel, r.status, r.error
       from reminders r left join reminder_schedule s on s.id = r.schedule_id
      where r.invoice_id = $1 order by s.offset_days nulls last, r.channel`,
    [invoiceId],
  );
  return rows as { what: string; channel: string; status: string; error: string | null }[];
}

async function bankTransfer(db: Client, account: string, amount: bigint, description: string) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, now(), $3, 'in', $4) returning id`,
    [account, `stop-${++seq}`, amount.toString(), description],
  );
  return rows[0].id as string;
}

describe("rule 1 — paid", () => {
  it("cancels everything not yet sent and queues one thank-you", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db, { dueInDays: 10, offset: -7 });
      const tx = await bankTransfer(db, s.account, BigInt(s.inv.transfer_amount), "TRSF");
      await actAs(db, s.operator);
      await db.query("select apply_payment($1, $2, $3)", [s.inv.id, tx, s.inv.transfer_amount]);
      await actAsAdmin(db);

      const after = await reminders(db, s.inv.id);
      const scheduled = after.filter((r) => r.what !== "thank_you");
      expect(scheduled.every((r) => r.status === "cancelled" && r.error === "The bill was paid")).toBe(true);
      expect(after.filter((r) => r.what === "thank_you")).toEqual([
        { what: "thank_you", channel: "email", status: "scheduled", error: null },
      ]);

      // the sender hands out the thank-you, and nothing else
      const handed = await claim(db, s.inv.id);
      expect(handed.map((r) => [r.template_key, r.amount_to_transfer, r.still_owed])).toEqual([
        ["thank_you", null, "0"],
      ]);
    });
  });

  it("no thank-you when the owner settled it without any money arriving", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db, { dueInDays: 10, offset: -7 });
      await actAs(db, s.owner);
      await db.query("select mark_invoice_paid($1, 'Swapped for their design work')", [s.inv.id]);
      await actAsAdmin(db);
      const after = await reminders(db, s.inv.id);
      expect(after.some((r) => r.what === "thank_you")).toBe(false);
      expect(after.every((r) => r.status === "cancelled")).toBe(true);
    });
  });

  it("checked again at send time: a due reminder for a bill that is now paid is never sent", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db, { dueInDays: 10, offset: -7 });
      // as if the bill changed without the usual trigger having run
      await db.query("alter table invoices disable trigger stop_reminders");
      await db.query("update invoices set status = 'paid', transfer_amount = null where id = $1", [
        s.inv.id,
      ]);
      expect(await claim(db, s.inv.id)).toEqual([]);
      const step = (await reminders(db, s.inv.id)).find((r) => r.what === "reminder -7");
      expect(step).toMatchObject({ status: "cancelled", error: "The bill was paid" });
    });
  });
});

describe("rule 2 — partly paid", () => {
  it("the message shows what is still owed and the new unique amount, read at send time", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db, { dueInDays: 10, offset: -7 });
      const tx = await bankTransfer(db, s.account, 100_000_000n, "TRSF");
      await actAs(db, s.operator);
      await db.query("select apply_payment($1, $2, 100000000)", [s.inv.id, tx]);
      await actAsAdmin(db);
      const now = (
        await db.query("select transfer_amount::text from invoices where id = $1", [s.inv.id])
      ).rows[0].transfer_amount as string;
      expect(now).not.toBe(s.inv.transfer_amount); // a fresh unique amount for the rest

      const [handed] = await claim(db, s.inv.id);
      expect(handed).toMatchObject({
        kind: "reminder",
        still_owed: (BASE - 100_000_000n).toString(),
        amount_to_transfer: now,
      });
    });
  });
});

describe("rule 3 — overdue waits for the bank", () => {
  it("not sent until the bank has been read after it was due; then sent", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db); // last bank read: a day ago
      expect(await claim(db, s.inv.id)).toEqual([]);
      expect((await reminders(db, s.inv.id)).find((r) => r.what === "overdue 3" && r.channel === "email"))
        .toMatchObject({ status: "scheduled" });

      await db.query("update bank_accounts set last_synced_at = now() where id = $1", [s.account]);
      expect((await claim(db, s.inv.id)).map((r) => [r.kind, r.channel]).sort()).toEqual([
        ["overdue", "email"],
      ]);
    });
  });

  it("paid this morning, sync not yet run: no overdue message — then the sync finds the payment", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db); // overdue message due now; bank last read yesterday
      // they paid this morning, but the bank hasn't been read since: we must not chase them
      expect(await claim(db, s.inv.id)).toEqual([]);

      // the sync runs, brings in their transfer, and the matching engine pays the bill
      await db.query("set local role service_role");
      await db.query("select sync_bank_batch($1, $2::jsonb, now())", [
        s.account,
        JSON.stringify([
          {
            external_id: `stop-sync-${++seq}`,
            occurred_at: new Date().toISOString(),
            amount: s.inv.transfer_amount,
            direction: "in",
            description_raw: "TRSF E-BANKING CR PT STOP RULES",
          },
        ]),
      ]);
      await db.query("select match_payments()");
      await actAsAdmin(db);

      // the overdue message is cancelled for good; what goes out is the thank-you
      const handed = await claim(db, s.inv.id);
      expect(handed.map((r) => r.template_key)).toEqual(["thank_you"]);
      const overdue = (await reminders(db, s.inv.id)).filter((r) => r.what === "overdue 3");
      expect(overdue.every((r) => r.status === "cancelled" && r.error === "The bill was paid")).toBe(true);
    });
  });

  it("with no bank account at all, overdue messages never go out", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db);
      await db.query("update bank_accounts set is_active = false");
      expect(await claim(db, s.inv.id)).toEqual([]);
    });
  });
});

describe("rule 4 — paused", () => {
  for (const [what, pause] of [
    ["the bill", "update invoices set reminders_paused = true where id = $1"],
    ["the customer", "update customers set reminders_paused = true where id = (select customer_id from invoices where id = $1)"],
    ["a switched-off customer", "update customers set is_active = false where id = (select customer_id from invoices where id = $1)"],
  ] as const) {
    it(`skips reminders when ${what} is paused — skipped, not saved up`, async () => {
      await withRulesOff(async (db) => {
        const s = await setup(db, { dueInDays: 10, offset: -7 });
        await db.query(pause, [s.inv.id]);
        expect(await claim(db, s.inv.id)).toEqual([]);
        expect((await reminders(db, s.inv.id)).find((r) => r.what === "reminder -7")).toMatchObject({
          status: "cancelled",
          error: "Reminders were paused",
        });
      });
    });
  }
});

describe("rule 5 — cancelled bill", () => {
  it("cancels every reminder not yet sent; nothing goes out, not even a thank-you", async () => {
    await withRulesOff(async (db) => {
      const s = await setup(db, { dueInDays: 10, offset: -7 });
      await actAs(db, s.operator);
      await db.query("select void_invoice($1, 'Wrong customer')", [s.inv.id]);
      await actAsAdmin(db);
      const after = await reminders(db, s.inv.id);
      expect(after.every((r) => r.status === "cancelled" && r.error === "The bill was cancelled")).toBe(true);
      expect(await claim(db, s.inv.id)).toEqual([]);
    });
  });
});
