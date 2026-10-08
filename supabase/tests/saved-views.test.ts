import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

// P7-T3: saved views — own views are private; the owner sets each role's starting view.
const names = async (db: import("pg").Client) =>
  (await db.query("select name from saved_views order by name")).rows.map((r) => r.name);

describe("saved views", () => {
  it("each person sees only their own views", async () => {
    await withRollback(async (db) => {
      await db.query("delete from saved_views");
      const ana = await createUser(db, "operator");
      const budi = await createUser(db, "operator");
      await actAs(db, ana);
      await db.query(
        "insert into saved_views (list, name, query) values ('money', 'Ana out', 'dir=out')",
      );
      await actAsAdmin(db);
      await actAs(db, budi);
      expect(await names(db)).toEqual([]);
      // and can't save one in someone else's name
      expect(
        (
          await tryQuery(
            db,
            "insert into saved_views (user_id, list, name) values ($1, 'money', 'x')",
            [ana],
          )
        ).error,
      ).toMatch(/row-level security/);
      // or delete someone else's
      expect((await tryQuery(db, "delete from saved_views")).rowCount).toBe(0);
    });
  });

  it("the owner sets a role's starting view; that role sees it; nobody else can set one", async () => {
    await withRollback(async (db) => {
      await db.query("delete from saved_views");
      const owner = await createUser(db, "owner");
      const operator = await createUser(db, "operator");
      const viewer = await createUser(db, "viewer");

      await actAs(db, operator);
      expect(
        (
          await tryQuery(
            db,
            "insert into saved_views (list, name, query, default_for_role) values ('money', 'mine', '', 'operator')",
          )
        ).error,
      ).toMatch(/row-level security/);

      await actAsAdmin(db);
      await actAs(db, owner);
      await db.query(
        "insert into saved_views (list, name, query, default_for_role) values ('money', 'To label', 'status=needs_label', 'operator')",
      );
      // one starting view per list and role
      expect(
        (
          await tryQuery(
            db,
            "insert into saved_views (list, name, query, default_for_role) values ('money', 'Another', '', 'operator')",
          )
        ).error,
      ).toMatch(/duplicate key/);

      await actAsAdmin(db);
      await actAs(db, operator);
      expect(await names(db)).toEqual(["To label"]);
      // an operator can't change or remove the owner's starting view
      expect((await tryQuery(db, "update saved_views set query = 'dir=in'")).rowCount).toBe(0);
      expect((await tryQuery(db, "delete from saved_views")).rowCount).toBe(0);

      await actAsAdmin(db);
      await actAs(db, viewer);
      expect(await names(db)).toEqual([]);
    });
  });

  it("a view holds only filter settings: never a link, a path or markup", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "viewer"));
      for (const query of [
        "https://evil.example",
        "/settings/team",
        "javascript:alert(1)",
        'q="><script>',
        "a b",
      ]) {
        expect(
          (
            await tryQuery(
              db,
              "insert into saved_views (list, name, query) values ('money', 'x', $1)",
              [query],
            )
          ).error,
          query,
        ).toMatch(/check constraint/);
      }
      await db.query(
        "insert into saved_views (list, name, query) values ('money', 'ok', 'dir=out&q=PT+MAJU&min=1500000')",
      );
    });
  });

  it("without a role (2FA required but not passed) nothing is visible or saved", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "owner"), "aal1");
      expect(
        (await tryQuery(db, "insert into saved_views (list, name) values ('money', 'x')")).error,
      ).toMatch(/row-level security/);
      expect(await names(db)).toEqual([]);
    });
  });
});
