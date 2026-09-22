import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

describe("current_app_role()", () => {
  it("returns the role only after 2FA (aal2)", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");

      await actAs(db, owner, "aal1");
      expect((await db.query("select current_app_role() as r")).rows[0].r).toBeNull();

      await actAsAdmin(db);
      await actAs(db, owner, "aal2");
      expect((await db.query("select current_app_role() as r")).rows[0].r).toBe("owner");
    });
  });

  it("new auth users start as viewer", async () => {
    await withRollback(async (db) => {
      const id = crypto.randomUUID();
      await db.query(
        `insert into auth.users (id, aud, role, email, raw_user_meta_data)
         values ($1, 'authenticated', 'authenticated', 'new@example.test', '{"name":"New"}')`,
        [id],
      );
      const { rows } = await db.query("select name, role from users where id = $1", [id]);
      expect(rows[0]).toEqual({ name: "New", role: "viewer" });
    });
  });
});

describe("users table RLS", () => {
  it("a viewer cannot write: no insert, no update (not even their own role), no delete", async () => {
    await withRollback(async (db) => {
      const viewer = await createUser(db, "viewer");
      const other = await createUser(db, "operator");
      await actAs(db, viewer);

      const promote = await tryQuery(db, "update users set role = 'owner' where id = $1", [viewer]);
      expect(promote.rowCount).toBe(0);
      const rename = await tryQuery(db, "update users set name = 'x' where id = $1", [other]);
      expect(rename.rowCount).toBe(0);
      const del = await tryQuery(db, "delete from users where id = $1", [other]);
      expect(del.rowCount).toBe(0);
      const ins = await tryQuery(db, "insert into users (id, role) values ($1, 'owner')", [
        crypto.randomUUID(),
      ]);
      expect(ins.error).toMatch(/row-level security|foreign key/);

      await actAsAdmin(db);
      const { rows } = await db.query("select role from users where id = $1", [viewer]);
      expect(rows[0].role).toBe("viewer");
    });
  });

  it("an operator cannot change roles either", async () => {
    await withRollback(async (db) => {
      const operator = await createUser(db, "operator");
      await actAs(db, operator);
      const res = await tryQuery(db, "update users set role = 'owner' where id = $1", [operator]);
      expect(res.rowCount).toBe(0);
    });
  });

  it("the owner can change roles, but only with 2FA", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      const viewer = await createUser(db, "viewer");

      await actAs(db, owner, "aal1");
      expect(
        (await tryQuery(db, "update users set role = 'operator' where id = $1", [viewer])).rowCount,
      ).toBe(0);

      await actAsAdmin(db);
      await actAs(db, owner, "aal2");
      expect(
        (await tryQuery(db, "update users set role = 'operator' where id = $1", [viewer])).rowCount,
      ).toBe(1);
    });
  });

  it("without 2FA a user sees only their own profile", async () => {
    await withRollback(async (db) => {
      const a = await createUser(db, "operator");
      await createUser(db, "viewer");
      await actAs(db, a, "aal1");
      const { rows } = await db.query("select id from users");
      expect(rows.map((r) => r.id)).toEqual([a]);
    });
  });

  it("anonymous requests see nothing", async () => {
    await withRollback(async (db) => {
      await createUser(db, "owner");
      await db.query("set local role anon");
      const res = await tryQuery(db, "select * from users");
      expect(res.error).toMatch(/permission denied/);
    });
  });
});
