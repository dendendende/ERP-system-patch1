import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

// P9-T5a: notifications — read from where each thing already lives; "new" is per person.

let seq = 0;

async function account(db: Client, last4 = "0088") {
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA', 'T', $1, 'csv') returning id",
      [last4],
    )
  ).rows[0].id as string;
}

async function out(db: Client, acct: string, amount: number, description: string, when = "now()") {
  return (
    await db.query(
      `insert into bank_transactions (bank_account_id, external_id, occurred_at, created_at, amount, direction, description_raw)
       values ($1, $2, ${when}, ${when}, $3, 'out', $4) returning id`,
      [acct, `note-${++seq}`, amount, description],
    )
  ).rows[0].id as string;
}

const mine = async (db: Client, ids: string[]) =>
  (
    await db.query(
      "select kind, id, amount::text, who, detail, is_new from notifications() where id = any($1) order by kind, who",
      [ids],
    )
  ).rows;

describe("notifications", () => {
  it("a balance that doesn't add up, a reminder that failed, a big payment to someone new", async () => {
    await withRulesOff(async (db) => {
      const acct = await account(db);
      const check = (
        await db.query(
          `insert into balance_checks (bank_account_id, checked_on, expected, actual, difference, status, likely_cause)
           values ($1, jakarta_today(), 1000, 900, -100, 'mismatch', 'Some days are missing') returning id`,
          [acct],
        )
      ).rows[0].id as string;

      const customer = (
        await db.query("insert into customers (name) values ('Notify Co') returning id")
      ).rows[0].id as string;
      await db.query("set local role service_role");
      const inv = (
        await db.query(
          "select id from create_invoice($1, 5000000, jakarta_today() - 5, jakarta_today() + 10)",
          [customer],
        )
      ).rows[0].id as string;
      await actAsAdmin(db);
      const failed = (
        await db.query(
          `insert into reminders (invoice_id, template_key, channel, scheduled_for, status, error)
           values ($1, 'reminder', 'email', now(), 'failed', 'Mailbox full') returning id`,
          [inv],
        )
      ).rows[0].id as string;

      // a payee paid before (last year) doesn't count; neither does a small payment or one to
      // our own account
      await out(db, acct, 200_000, "TRSF PT LAMA 0101", "now() - interval '1 year'");
      const known = await out(db, acct, 50_000_000, "TRSF PT LAMA 0202");
      const fresh = await out(db, acct, 25_000_000, "TRSF PT BARU SEKALI 0303");
      const small = await out(db, acct, 9_999_999, "TRSF TOKO KECIL 0404");
      const own = await out(db, acct, 80_000_000, "PINDAH KE TABUNGAN 0505");
      await db.query(
        `update entries set status = 'labelled', category_id = (select id from categories
                                             where report_group = 'transfer' and type = 'out'
                                               and name <> 'Cancelled (entered by mistake)' limit 1)
          where bank_transaction_id = $1`,
        [own],
      );

      const viewer = await createUser(db, "viewer");
      await actAs(db, viewer);
      expect(await mine(db, [check, failed, known, fresh, small, own])).toEqual([
        {
          kind: "failed_delivery",
          id: failed,
          amount: null,
          who: "Notify Co",
          detail: "Mailbox full",
          is_new: true,
        },
        {
          kind: "mismatch",
          id: check,
          amount: "-100",
          who: "BCA ••0088",
          detail: "Some days are missing",
          is_new: true,
        },
        {
          kind: "new_payee",
          id: fresh,
          amount: "25000000",
          who: "TRSF PT BARU SEKALI 0303",
          detail: null,
          is_new: true,
        },
      ]);
    });
  });

  it("opening the centre makes what's there old — for that person only", async () => {
    await withRulesOff(async (db) => {
      const acct = await account(db, "0089");
      const now = await out(db, acct, 30_000_000, "TRSF PT SATU 0606");
      // "now" doesn't move inside a test transaction: something a minute later stands for later
      const later = await out(
        db,
        acct,
        30_000_000,
        "TRSF PT DUA 0707",
        "now() + interval '1 minute'",
      );
      const [me, other] = [await createUser(db, "operator"), await createUser(db, "owner")];

      await actAs(db, me);
      await db.query("select mark_notifications_seen()");
      expect(
        Object.fromEntries((await mine(db, [now, later])).map((n) => [n.id, n.is_new])),
      ).toEqual({
        [now]: false,
        [later]: true,
      });
      await actAsAdmin(db);
      await actAs(db, other);
      expect((await mine(db, [now, later])).every((n) => n.is_new)).toBe(true);
      // nobody reads another person's "seen" time
      expect((await db.query("select user_id from notification_seen")).rows).toEqual([]);
    });
  });

  it("only team members can mark them seen", async () => {
    await withRulesOff(async (db) => {
      await db.query("set local role anon");
      expect((await tryQuery(db, "select mark_notifications_seen()")).error).toMatch(
        /permission denied/,
      );
    });
  });
});
