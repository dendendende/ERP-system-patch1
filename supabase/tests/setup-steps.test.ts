import { describe, expect, it } from "vitest";
import { actAs, createUser, tryQuery, withRollback } from "./db";

// P6-T4: only the owner marks setup steps; the list of steps is fixed; marks can't be undone
// through the API (nobody needs to — a marked step only hides a hint).
describe("setup steps", () => {
  it("the owner marks a step; others can see it but not mark one", async () => {
    await withRollback(async (db) => {
      await db.query("delete from setup_steps");
      const operator = await createUser(db, "operator");
      await actAs(db, await createUser(db, "owner"));
      await db.query("insert into setup_steps (step) values ('reminders')");
      expect(
        (await tryQuery(db, "insert into setup_steps (step) values ('made_up')")).error,
      ).toMatch(/check constraint/);
      expect((await tryQuery(db, "delete from setup_steps")).error).toMatch(/permission denied/);

      await actAs(db, operator);
      expect((await db.query("select step from setup_steps")).rows).toEqual([
        { step: "reminders" },
      ]);
      expect((await tryQuery(db, "insert into setup_steps (step) values ('team')")).error).toMatch(
        /row-level security/,
      );
    });
  });
});
