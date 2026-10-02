import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

let n = 0;

/** A bill `daysLate` days past due, with the bank last read `bankReadHoursAgo` hours ago. */
async function lateBill(db: Client, daysLate: number, bankReadHoursAgo = 0) {
  await db.query("update bank_accounts set is_active = false");
  await db.query(
    `insert into bank_accounts (bank_name, account_name, account_last4, source, last_synced_at)
     values ('BCA', 'T', '0014', 'aggregator', now() - make_interval(hours => $1::int) + interval '1 second')`,
    [bankReadHoursAgo],
  );
  const customer = (
    await db.query("insert into customers (name) values ($1) returning id", [`PT Escalate ${++n}`])
  ).rows[0].id as string;
  await db.query("set local role service_role");
  const { rows } = await db.query(
    "select id from create_invoice($1, 745000000, jakarta_today() - 60, (jakarta_today() - $2::int)::date)",
    [customer, daysLate],
  );
  await actAsAdmin(db);
  return { invoice: rows[0].id as string, customer };
}

const listed = async (db: Client, invoice: string) =>
  (await db.query("select customer_name, days_late, still_owed::text from team_escalations where invoice_id = $1", [invoice]))
    .rows;

describe("team escalations", () => {
  it("a bill 34 days late is on the team's list, with who to call and what is owed", async () => {
    await withRulesOff(async (db) => {
      const { invoice } = await lateBill(db, 34);
      expect(await listed(db, invoice)).toEqual([
        { customer_name: expect.stringMatching(/^PT Escalate/), days_late: 34, still_owed: "745000000" },
      ]);
    });
  });

  it("not before the escalation day", async () => {
    await withRulesOff(async (db) => {
      const { invoice } = await lateBill(db, 10);
      expect(await listed(db, invoice)).toEqual([]);
    });
  });

  it("drops off the moment it's paid or cancelled", async () => {
    await withRulesOff(async (db) => {
      const { invoice } = await lateBill(db, 20);
      await actAs(db, await createUser(db, "owner"));
      await db.query("select mark_invoice_paid($1, 'Paid cash')", [invoice]);
      await actAsAdmin(db);
      expect(await listed(db, invoice)).toEqual([]);
    });
  });

  it("not while their reminders are paused, or when the escalation step is off", async () => {
    await withRulesOff(async (db) => {
      const a = await lateBill(db, 20);
      await db.query("update customers set reminders_paused = true where id = $1", [a.customer]);
      expect(await listed(db, a.invoice)).toEqual([]);

      const b = await lateBill(db, 20);
      await db.query("update reminder_schedule set is_active = false where kind = 'escalate_team'");
      expect(await listed(db, b.invoice)).toEqual([]);
    });
  });

  it("waits for a bank read after the escalation day — maybe they paid this morning", async () => {
    await withRulesOff(async (db) => {
      // escalation day was yesterday (15 days late); the bank was last read two days ago
      const { invoice } = await lateBill(db, 15, 48);
      expect(await listed(db, invoice)).toEqual([]);
      await db.query("update bank_accounts set last_synced_at = now() + interval '1 second' where is_active");
      expect(await listed(db, invoice)).toHaveLength(1);
    });
  });

  it("the whole team sees it", async () => {
    await withRulesOff(async (db) => {
      const { invoice } = await lateBill(db, 20);
      await actAs(db, await createUser(db, "viewer"));
      expect(await listed(db, invoice)).toHaveLength(1);
    });
  });
});
