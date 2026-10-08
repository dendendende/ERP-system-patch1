import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

// P6-T6: the app's side of the comparison is always the database's own numbers.
describe("parallel run", () => {
  it("stores the owner's numbers next to the app's own, worked out at that moment", async () => {
    await withRollback(async (db) => {
      await db.query("delete from parallel_run_weeks");
      await actAs(db, await createUser(db, "owner"));
      await db.query(
        "select public.record_parallel_week('2026-09-28', 100, 200, 300, 400, 'from my spreadsheet')",
      );
      const expected = (
        await db.query(
          `select m.came_in, m.went_out, s.cash_in_bank, s.still_owed
             from public.came_in_went_out('2026-09-28', '2026-10-04') m, public.money_summary() s`,
        )
      ).rows[0];
      const { rows } = await db.query("select * from parallel_run_weeks");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        their_came_in: "100",
        their_went_out: "200",
        their_cash: "300",
        their_still_owed: "400",
        app_came_in: expected.came_in,
        app_went_out: expected.went_out,
        app_cash: expected.cash_in_bank,
        app_still_owed: expected.still_owed,
        notes: "from my spreadsheet",
      });

      // writing the same week again replaces it (e.g. after a typo)
      await db.query("select public.record_parallel_week('2026-09-28', 101, 200, 300, 400)");
      const again = await db.query("select their_came_in from parallel_run_weeks");
      expect(again.rows).toEqual([{ their_came_in: "101" }]);
    });
  });

  it("only Mondays, only the owner, and nobody types the app's numbers", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      expect(
        (await tryQuery(db, "select public.record_parallel_week('2026-09-29', 1, 1, 1, 1)")).error,
      ).toMatch(/check constraint/);
      expect(
        (
          await tryQuery(
            db,
            `insert into parallel_run_weeks (week_start, their_came_in, their_went_out, their_cash,
               their_still_owed, app_came_in, app_went_out, app_cash, app_still_owed)
             values ('2026-09-21', 1, 1, 1, 1, 1, 1, 1, 1)`,
          )
        ).error,
      ).toMatch(/permission denied/);

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "operator"));
      expect(
        (await tryQuery(db, "select public.record_parallel_week('2026-09-28', 1, 1, 1, 1)")).error,
      ).toMatch(/Only the owner/);
      expect((await db.query("select count(*)::int n from parallel_run_weeks")).rows[0].n).toBe(0);
    });
  });
});
