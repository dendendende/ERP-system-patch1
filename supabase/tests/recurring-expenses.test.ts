import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRulesOff } from "./db";

let seq = 0;
const M = 1_000_000;

async function setup(db: Client) {
  await db.query("update bank_accounts set is_active = false");
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA','T','0019','csv') returning id",
    )
  ).rows[0].id as string;
}

async function out(db: Client, acct: string, day: string, amount: number, description: string) {
  await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, 'out', $5)`,
    [acct, `rec-${++seq}`, day, amount, description],
  );
}

/** Seeded history: rent and salaries every month, hosting that wobbles, and noise that isn't regular. */
async function seed(db: Client, acct: string) {
  for (const [m, wsRef] of [["06", 11], ["07", 22], ["08", 33], ["09", 44]] as const) {
    await out(db, acct, `2031-${m}-01`, 12 * M, "SEWA KANTOR GEDUNG MENARA");
    await out(db, acct, `2031-${m}-25`, 45 * M, `TRF KE PAYROLL GAJI KARYAWAN ${m}${wsRef}/FTSCY/WS${wsRef}9`);
  }
  await out(db, acct, "2031-07-05", 3_200_000, "AMAZON WEB SERVICES AWS.AMAZON.CO");
  await out(db, acct, "2031-08-05", 3_500_000, "AMAZON WEB SERVICES AWS.AMAZON.CO");
  await out(db, acct, "2031-09-06", 3_600_000, "AMAZON WEB SERVICES AWS.AMAZON.CO");
  // not regular:
  await out(db, acct, "2031-07-11", 80_000, "QRIS TOKO ATK SEJAHTERA"); // twice in one month
  await out(db, acct, "2031-07-19", 95_000, "QRIS TOKO ATK SEJAHTERA");
  await out(db, acct, "2031-08-14", 60_000, "QRIS TOKO ATK SEJAHTERA");
  await out(db, acct, "2031-06-20", 1_500_000, "SERVIS AC"); // with a gap
  await out(db, acct, "2031-07-20", 1_500_000, "SERVIS AC");
  await out(db, acct, "2031-09-20", 1_500_000, "SERVIS AC");
  await out(db, acct, "2031-08-09", 30 * M, "TOKO LAPTOP"); // one-off
  for (const m of ["01", "02", "03"]) await out(db, acct, `2031-${m}-03`, 2 * M, "SEWA GUDANG LAMA"); // stopped
}

const suggest = async (db: Client) =>
  (
    await db.query(
      "select name, expected_amount::text, day_of_month, months_seen from suggest_recurring_expenses('2031-10-02')",
    )
  ).rows;

describe("suggesting recurring expenses", () => {
  it("finds rent, salaries and hosting — and nothing irregular, one-off or stopped", async () => {
    await withRulesOff(async (db) => {
      await seed(db, await setup(db));
      expect(await suggest(db)).toEqual([
        { name: "TRF KE PAYROLL GAJI KARYAWAN 0944/FTSCY/WS449", expected_amount: String(45 * M), day_of_month: 25, months_seen: 4 },
        { name: "SEWA KANTOR GEDUNG MENARA", expected_amount: String(12 * M), day_of_month: 1, months_seen: 4 },
        { name: "AMAZON WEB SERVICES AWS.AMAZON.CO", expected_amount: "3500000", day_of_month: 5, months_seen: 3 },
      ]);
    });
  });

  it("only suggests: looking creates nothing", async () => {
    await withRulesOff(async (db) => {
      await seed(db, await setup(db));
      const before = (await db.query("select count(*)::int as n from recurring_expenses")).rows[0].n;
      await suggest(db);
      expect((await db.query("select count(*)::int as n from recurring_expenses")).rows[0].n).toBe(before);
    });
  });

  it("confirmed or dismissed patterns aren't suggested again", async () => {
    await withRulesOff(async (db) => {
      await seed(db, await setup(db));
      await actAs(db, await createUser(db, "owner"));
      await db.query(
        `insert into recurring_expenses (name, expected_amount, frequency, day_of_month, start_date, source_pattern)
         values ('Office rent', 12000000, 'monthly', 1, '2031-06-01', payee_pattern('SEWA KANTOR GEDUNG MENARA'))`,
      );
      await db.query(
        "insert into recurring_suggestion_dismissals (pattern) values (payee_pattern('AMAZON WEB SERVICES AWS.AMAZON.CO'))",
      );
      expect((await suggest(db)).map((s) => s.name)).toEqual(["TRF KE PAYROLL GAJI KARYAWAN 0944/FTSCY/WS449"]);
    });
  });

  it("only the owner adds or changes recurring expenses; nobody deletes them", async () => {
    await withRulesOff(async (db) => {
      const add = `insert into recurring_expenses (name, expected_amount, frequency, day_of_month, start_date)
                   values ('Internet', 550000, 'monthly', 10, '2031-01-01')`;
      await actAs(db, await createUser(db, "operator"));
      expect((await tryQuery(db, add)).error).toMatch(/row-level security/);
      await actAsAdmin(db);
      await actAs(db, await createUser(db, "owner"));
      expect((await tryQuery(db, add)).error).toBeNull();
      expect((await tryQuery(db, "delete from recurring_expenses")).error).toMatch(/permission denied/);
    });
  });
});
