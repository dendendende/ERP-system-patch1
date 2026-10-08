import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

// P6-T2: switch people off (never delete), keep at least one owner, changes audited + immediate.
describe("team", () => {
  it("a switched-off person loses access on their next query", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      const operator = await createUser(db, "operator");
      await actAs(db, operator);
      expect((await db.query("select public.current_app_role() r")).rows[0].r).toBe("operator");
      expect((await db.query("select count(*)::int n from categories")).rows[0].n).toBeGreaterThan(
        0,
      );

      await actAs(db, owner);
      await db.query("update users set is_active = false where id = $1", [operator]);

      await actAs(db, operator);
      expect((await db.query("select public.current_app_role() r")).rows[0].r).toBeNull();
      expect((await db.query("select count(*)::int n from categories")).rows[0].n).toBe(0);
    });
  });

  it("a role change applies to the very next query, and is audited with who did it", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      const viewer = await createUser(db, "viewer");
      await actAs(db, owner);
      await db.query("update users set role = 'operator' where id = $1", [viewer]);
      await actAs(db, viewer);
      expect((await db.query("select public.current_app_role() r")).rows[0].r).toBe("operator");

      await actAsAdmin(db);
      const { rows } = await db.query(
        `select actor_id, old_value, new_value from audit_log
          where table_name = 'users' and record_id = $1 and action = 'update'`,
        [viewer],
      );
      expect(rows).toEqual([
        { actor_id: owner, old_value: { role: "viewer" }, new_value: { role: "operator" } },
      ]);
    });
  });

  it("only the owner can change roles or switch people off", async () => {
    await withRollback(async (db) => {
      await createUser(db, "owner");
      const operator = await createUser(db, "operator");
      const viewer = await createUser(db, "viewer");
      await actAs(db, operator);
      expect(
        (await tryQuery(db, "update users set is_active = false where id = $1", [viewer])).rowCount,
      ).toBe(0);
      expect(
        (await tryQuery(db, "update users set role = 'owner' where id = $1", [operator])).rowCount,
      ).toBe(0);
    });
  });

  it("nobody deletes a team member — not through the API, not as the database owner", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      const viewer = await createUser(db, "viewer");
      await actAs(db, owner);
      expect((await tryQuery(db, "delete from users where id = $1", [viewer])).error).toMatch(
        /permission denied/,
      );
      await actAsAdmin(db);
      expect((await tryQuery(db, "delete from auth.users where id = $1", [viewer])).error).toMatch(
        /never deleted/,
      );
    });
  });

  it("the last active owner cannot be demoted or switched off — by themselves either", async () => {
    await withRollback(async (db) => {
      // Only this test's owners count: switch off any owner already in the local database.
      await db.query("alter table users disable trigger users_guard");
      await db.query("update users set is_active = false where role = 'owner'");
      await db.query("alter table users enable trigger users_guard");
      const a = await createUser(db, "owner");
      const b = await createUser(db, "owner");
      await actAs(db, a);

      // with two owners, one may step down
      await db.query("update users set role = 'operator' where id = $1", [b]);
      expect(
        (await tryQuery(db, "update users set role = 'viewer' where id = $1", [a])).error,
      ).toMatch(/at least one owner/);
      expect(
        (await tryQuery(db, "update users set is_active = false where id = $1", [a])).error,
      ).toMatch(/at least one owner/);
      // making someone else an owner first unblocks it
      await db.query("update users set role = 'owner' where id = $1", [b]);
      await db.query("update users set is_active = false where id = $1", [a]);
    });
  });
});

describe("2-step sign-in switch", () => {
  it("while required, a session without 2FA sees nothing; switched off, it works like before", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      await actAs(db, owner, "aal1");
      expect((await db.query("select public.current_app_role() r")).rows[0].r).toBeNull();
      // and can't switch it off without having passed 2FA
      expect(
        (await tryQuery(db, "update security_settings set require_two_factor = false")).rowCount,
      ).toBe(0);

      await actAs(db, owner); // aal2
      await db.query("update security_settings set require_two_factor = false");
      await actAs(db, owner, "aal1");
      expect((await db.query("select public.current_app_role() r")).rows[0].r).toBe("owner");

      await actAsAdmin(db);
      const { rows } = await db.query(
        `select actor_id, new_value from audit_log where table_name = 'security_settings'
          order by id desc limit 1`,
      );
      expect(rows[0]).toEqual({ actor_id: owner, new_value: { require_two_factor: false } });
    });
  });

  it("only the owner can change it", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "operator"));
      expect(
        (await tryQuery(db, "update security_settings set require_two_factor = false")).rowCount,
      ).toBe(0);
    });
  });
});
