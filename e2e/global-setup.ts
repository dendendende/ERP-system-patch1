// Around the whole e2e run:
//  - 2-step sign-in ON (the tests check the secure mode), whatever the local switch says; the
//    previous setting is put back afterwards;
//  - before and after, what test runs leave behind in the shared local database is tidied, so it
//    never piles up (and never crowds tests or the local app): bills the test users wrote that
//    are still open are cancelled — their reminders close with them — and the thank-you left
//    for the made-up "E2E Flow" customers is closed, and money the test users entered by hand is
//    removed;
//  - afterwards, the "new device" records the test users left behind are removed, so they don't
//    fill the owner's Home in the local app (every test signs in from a fresh browser).
import { Client } from "pg";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";

async function withDb<T>(fn: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Test users' bills that are still open (a run that failed midway never got to cancel them). */
async function tidyTestBills(db: Client) {
  await db.query("begin");
  await db.query("select set_config('app.audit_reason', 'Left by an e2e run', true)");
  await db.query(
    `update invoices set status = 'void', transfer_amount = null, void_reason = 'Left by an e2e run'
      where status = 'open'
        and id::text in (select a.record_id from audit_log a join auth.users u on u.id = a.actor_id
                          where a.table_name = 'invoices' and a.action = 'insert'
                            and u.email like 'e2e-%')`,
  );
  await db.query(
    `update reminders set status = 'cancelled', error = 'Left by an e2e run'
      where status = 'scheduled' and claimed_at is null
        and invoice_id in (select i.id from invoices i join customers c on c.id = i.customer_id
                            where c.name like 'E2E Flow %')`,
  );
  // money the test users typed in by hand: bank_transactions is insert-only for everyone; only
  // this clean-up of test users' own entries steps around it
  await db.query(
    "alter table bank_transactions disable trigger bank_transactions_no_update_delete",
  );
  const hand = `select t.id from bank_transactions t join auth.users u on u.id = t.entered_by
                 where u.email like 'e2e-%'`;
  await db.query(`delete from entries where bank_transaction_id in (${hand})`);
  await db.query(`delete from bank_transactions where id in (${hand})`);
  await db.query("alter table bank_transactions enable trigger bank_transactions_no_update_delete");
  await db.query("commit");
}

export default async function globalSetup() {
  const before = await withDb(async (db) => {
    const { rows } = await db.query("select require_two_factor from security_settings");
    await db.query("update security_settings set require_two_factor = true");
    await tidyTestBills(db);
    return rows[0]?.require_two_factor as boolean;
  });

  return async () => {
    await withDb(async (db) => {
      await db.query("update security_settings set require_two_factor = $1", [before]);
      await tidyTestBills(db);
      // sign_in_devices is insert-only for everyone; only this clean-up of test users steps around it
      await db.query("begin");
      await db.query(
        "alter table sign_in_devices disable trigger sign_in_devices_no_update_delete",
      );
      await db.query(
        `delete from sign_in_devices
          where user_id in (select id from auth.users where email like 'e2e-%')`,
      );
      await db.query("alter table sign_in_devices enable trigger sign_in_devices_no_update_delete");
      await db.query("commit");
    });
  };
}
