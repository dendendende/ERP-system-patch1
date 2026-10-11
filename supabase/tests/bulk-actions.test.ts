import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

// P9-T4a: bulk label, remind and cancel — the same rules as one at a time, row by row (a row
// that can't be done says why, the rest still happen), every change audited with how many.

let seq = 0;

async function account(db: Client) {
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('Bulk', 'T', '0077', 'csv') returning id",
    )
  ).rows[0].id as string;
}

/** Money in or out, typed in by hand (as the person acting now). */
const money = async (db: Client, acct: string, direction: "in" | "out") =>
  (
    await db.query(
      `select public.record_by_hand($1, $2, '2001-03-02', $3, ${++seq}000, 'Bulk ${seq}', null) id`,
      [randomUUID(), acct, direction],
    )
  ).rows[0].id as string;

const results = async (db: Client, sql: string, params: unknown[]) =>
  Object.fromEntries(
    (await db.query(`select id, error from ${sql}`, params)).rows.map((r) => [r.id, r.error]),
  );

const audited = async (db: Client, table: string, ids: string[]) =>
  (
    await db.query(
      `select record_id, actor_id, reason from audit_log
        where table_name = $1 and record_id = any($2) order by record_id`,
      [table, ids],
    )
  ).rows as { record_id: string; actor_id: string; reason: string | null }[];

describe("bulk label", () => {
  it("labels each one, says why the others weren't, and audits every change", async () => {
    await withRulesOff(async (db) => {
      const acct = await account(db);
      const out = (
        await db.query(
          "insert into categories (name, type, report_group) values ('Bulk out', 'out', 'Running costs') returning id",
        )
      ).rows[0].id as string;
      const operator = await createUser(db, "operator");
      await actAs(db, operator);
      const [a, b, came, gone] = [
        await money(db, acct, "out"),
        await money(db, acct, "out"),
        await money(db, acct, "in"),
        await money(db, acct, "out"),
      ];
      // one mistake already cancelled, the usual way
      await db.query(
        `update entries set category_id = (select id from categories where is_system and type = 'out' and name = 'Cancelled (entered by mistake)')
          where bank_transaction_id = $1`,
        [gone],
      );

      const r = await results(db, "bulk_label($1, $2)", [[a, b, came, gone], out]);
      expect(r[a]).toBeNull();
      expect(r[b]).toBeNull();
      expect(r[came]).toMatch(/does not match the direction/);
      expect(r[gone]).toBe("It was cancelled, so it stays as it is");

      await actAsAdmin(db);
      const entries = (
        await db.query(
          "select id, bank_transaction_id, category_id, status from entries where bank_transaction_id = any($1)",
          [[a, b, came]],
        )
      ).rows;
      const labelled = entries.filter((e) => e.category_id === out);
      expect(labelled.map((e) => e.bank_transaction_id).sort()).toEqual([a, b].sort());
      expect(labelled.every((e) => e.status === "labelled")).toBe(true);
      // audited: who, and that it was done together (only the two that changed)
      const log = (
        await audited(
          db,
          "entries",
          entries.map((e) => e.id),
        )
      ).filter((l) => l.reason === "Labelled 4 at once");
      expect(log.map((l) => l.record_id).sort()).toEqual(labelled.map((e) => e.id).sort());
      expect(log.every((l) => l.actor_id === operator)).toBe(true);
    });
  });

  it("refused: viewers, cancelling in bulk, nothing ticked, more than 1,000", async () => {
    await withRulesOff(async (db) => {
      const acct = await account(db);
      const operator = await createUser(db, "operator");
      await actAs(db, operator);
      const tx = await money(db, acct, "out");
      const cancelled = (
        await db.query(
          "select id from categories where is_system and type = 'out' and name = 'Cancelled (entered by mistake)'",
        )
      ).rows[0].id;
      const anyOut = (await db.query("select id from categories where type = 'out' limit 1"))
        .rows[0].id;
      expect(
        (await tryQuery(db, "select * from bulk_label($1, $2)", [[tx], cancelled])).error,
      ).toMatch(/one entry at a time/);
      expect((await tryQuery(db, "select * from bulk_label($1, $2)", [[], anyOut])).error).toBe(
        "Nothing ticked",
      );
      const many = Array.from({ length: 1001 }, () => randomUUID());
      expect((await tryQuery(db, "select * from bulk_label($1, $2)", [many, anyOut])).error).toBe(
        "At most 1,000 at a time",
      );
      await actAsAdmin(db);
      await actAs(db, await createUser(db, "viewer"));
      expect(
        (await tryQuery(db, "select * from bulk_label($1, $2)", [[tx], anyOut])).error,
      ).toMatch(/Not allowed/);
    });
  });
});

/** Two customers (one without an email address) and an operator acting. */
async function billing(db: Client) {
  const [withEmail, noEmail] = [
    "insert into customers (name, billing_email) values ('Bulk A', 'ap@bulk-a.example') returning id",
    "insert into customers (name) values ('Bulk B') returning id",
  ];
  const a = (await db.query(withEmail)).rows[0].id as string;
  const b = (await db.query(noEmail)).rows[0].id as string;
  const operator = await createUser(db, "operator");
  await actAs(db, operator);
  const bill = async (customer: string) =>
    (
      await db.query(
        "select id from create_invoice($1, 5000000, jakarta_today() - 5, jakarta_today() + 10)",
        [customer],
      )
    ).rows[0].id as string;
  return { a, b, operator, bill };
}

describe("bulk reminder", () => {
  it("queues one for each bill it can, says why not for the rest, and audits who asked", async () => {
    await withRulesOff(async (db) => {
      const s = await billing(db);
      const [one, two, noEmail] = [await s.bill(s.a), await s.bill(s.a), await s.bill(s.b)];
      const r = await results(db, "bulk_send_reminder_now($1)", [[one, two, noEmail]]);
      expect(r).toEqual({
        [one]: null,
        [two]: null,
        [noEmail]: "This customer has no email address",
      });
      // a second go the same day: nothing doubled
      const again = await results(db, "bulk_send_reminder_now($1)", [[one]]);
      expect(again[one]).toMatch(/already went out today/);

      await actAsAdmin(db);
      const queued = (
        await db.query(
          "select id, invoice_id from reminders where invoice_id = any($1) and schedule_id is null",
          [[one, two, noEmail]],
        )
      ).rows;
      expect(queued.map((q) => q.invoice_id).sort()).toEqual([one, two].sort());
      const log = await audited(
        db,
        "reminders",
        queued.map((q) => q.id),
      );
      expect(log).toHaveLength(2);
      expect(
        log.every(
          (l) => l.actor_id === s.operator && l.reason === "Reminded about 3 bills at once",
        ),
      ).toBe(true);
    });
  });

  it("one sent by hand alone is audited too; the scheduled ones are not", async () => {
    await withRulesOff(async (db) => {
      const s = await billing(db);
      const bill = await s.bill(s.a);
      const id = (await db.query("select send_reminder_now($1) id", [bill])).rows[0].id;
      await actAsAdmin(db);
      expect(await audited(db, "reminders", [id])).toEqual([
        { record_id: id, actor_id: s.operator, reason: null },
      ]);
      const scheduled = (
        await db.query(
          "select id from reminders where invoice_id = $1 and schedule_id is not null",
          [bill],
        )
      ).rows.map((r) => r.id);
      expect(scheduled.length).toBeGreaterThan(0);
      expect(await audited(db, "reminders", scheduled)).toEqual([]);
    });
  });
});

describe("bulk cancel", () => {
  it("cancels bills nothing was paid towards, with the reason, and leaves the rest", async () => {
    await withRulesOff(async (db) => {
      const s = await billing(db);
      const [open, partly, done] = [await s.bill(s.a), await s.bill(s.a), await s.bill(s.b)];
      // part of one paid; another already cancelled
      await actAsAdmin(db);
      const acct = await account(db);
      const tx = (
        await db.query(
          `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
           values ($1, $2, now(), 1000000, 'in', 'TRSF') returning id`,
          [acct, `bulk-${++seq}`],
        )
      ).rows[0].id;
      await actAs(db, s.operator);
      await db.query("select apply_payment($1, $2, 1000000)", [partly, tx]);
      await db.query("select void_invoice($1, 'Typo')", [done]);

      const r = await results(db, "bulk_void_invoices($1, $2)", [
        [open, partly, done],
        "Duplicate",
      ]);
      expect(r).toEqual({
        [open]: null,
        [partly]: "Partly paid: cancel it on its own page",
        [done]: "Only an invoice still waiting for money can be voided",
      });
      await actAsAdmin(db);
      const states = (
        await db.query("select id, status, void_reason from invoices where id = any($1)", [
          [open, partly],
        ])
      ).rows;
      expect(states.find((x) => x.id === open)).toMatchObject({
        status: "void",
        void_reason: "Duplicate (cancelled 3 at once)",
      });
      expect(states.find((x) => x.id === partly)?.status).toBe("partly_paid");
      const log = (await audited(db, "invoices", [open])).filter(
        (l) => l.reason === "Duplicate (cancelled 3 at once)",
      );
      expect(log).toEqual([
        { record_id: open, actor_id: s.operator, reason: "Duplicate (cancelled 3 at once)" },
      ]);
    });
  });

  it("refused without a reason, and for viewers", async () => {
    await withRulesOff(async (db) => {
      const s = await billing(db);
      const bill = await s.bill(s.a);
      expect(
        (await tryQuery(db, "select * from bulk_void_invoices($1, '  ')", [[bill]])).error,
      ).toMatch(/Say why/);
      await actAsAdmin(db);
      await actAs(db, await createUser(db, "viewer"));
      expect(
        (await tryQuery(db, "select * from bulk_void_invoices($1, 'x')", [[bill]])).error,
      ).toMatch(/Not allowed/);
    });
  });
});
