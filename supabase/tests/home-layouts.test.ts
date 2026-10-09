import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

describe("home_layouts", () => {
  it("each person sees and changes only their own Home", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      const viewer = await createUser(db, "viewer");

      await actAs(db, viewer);
      expect(
        (await tryQuery(db, "insert into home_layouts (cues) values ('{cash,dso}')")).error,
      ).toBeNull();
      await actAsAdmin(db);

      // not even the owner sees or changes someone else's
      await actAs(db, owner);
      expect((await db.query("select * from home_layouts")).rows).toEqual([]);
      expect(
        (await tryQuery(db, "update home_layouts set cues = '{}' where user_id = $1", [viewer]))
          .rowCount,
      ).toBe(0);
      expect(
        (await tryQuery(db, "insert into home_layouts (user_id, cues) values ($1, '{}')", [viewer]))
          .error,
      ).toMatch(/row-level security/);
      await actAsAdmin(db);

      await actAs(db, viewer, "aal1"); // 2-step sign-in not done
      expect((await db.query("select * from home_layouts")).rows).toEqual([]);
      await actAsAdmin(db);

      await actAs(db, viewer);
      expect((await db.query("select cues from home_layouts")).rows).toEqual([
        { cues: ["cash", "dso"] },
      ]);
    });
  });

  it("holds cue names only", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "operator"));
      const bad = await tryQuery(db, "insert into home_layouts (cues) values ('{\"<script>\"}')");
      expect(bad.error).toMatch(/check constraint/);
    });
  });
});
