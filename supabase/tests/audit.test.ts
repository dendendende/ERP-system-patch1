import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

async function auditRows(db: Client, recordId: string) {
  const { rows } = await db.query(
    `select actor_id, action, table_name, old_value, new_value, reason
       from audit_log where record_id = $1 order by id`,
    [recordId],
  );
  return rows;
}

describe("audit trigger", () => {
  it("logs inserts with the full new row", async () => {
    await withRollback(async (db) => {
      const id = await createUser(db, "viewer");
      const [first] = await auditRows(db, id);
      expect(first).toMatchObject({ action: "insert", table_name: "users", old_value: null });
      expect(first.new_value).toMatchObject({ id, role: "viewer" });
    });
  });

  it("logs updates as a diff of only the changed columns, with actor and reason", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      const viewer = await createUser(db, "viewer");
      await actAs(db, owner);
      await db.query(
        "select set_config('app.audit_reason', 'Promoted to help with billing', true)",
      );
      await db.query("update users set role = 'operator', name = 'Vera' where id = $1", [viewer]);
      await actAsAdmin(db);

      const updates = (await auditRows(db, viewer)).filter((r) => r.action === "update");
      expect(updates.at(-1)).toEqual({
        actor_id: owner,
        action: "update",
        table_name: "users",
        old_value: { role: "viewer", name: "" },
        new_value: { role: "operator", name: "Vera" },
        reason: "Promoted to help with billing",
      });
    });
  });

  it("does not log updates that change nothing", async () => {
    await withRollback(async (db) => {
      const id = await createUser(db, "viewer");
      const before = (await auditRows(db, id)).length;
      await db.query("update users set role = role where id = $1", [id]);
      expect((await auditRows(db, id)).length).toBe(before);
    });
  });

  it("logs deletes with the full old row", async () => {
    await withRollback(async (db) => {
      // users are never deleted (P6-T2), so use another audited table
      const { rows } = await db.query(
        "insert into categories (name, type, report_group) values ('Audit delete test', 'out', 'other') returning id",
      );
      const id = rows[0].id;
      await db.query("delete from categories where id = $1", [id]);
      const last = (await auditRows(db, id)).at(-1);
      expect(last).toMatchObject({ action: "delete", new_value: null });
      expect(last.old_value).toMatchObject({ id, name: "Audit delete test" });
    });
  });
});

describe("audit_log is insert-only", () => {
  it("cannot be updated, deleted, or truncated — even by the database owner", async () => {
    await withRollback(async (db) => {
      await createUser(db, "viewer");
      for (const sql of [
        "update audit_log set reason = 'tampered'",
        "delete from audit_log",
        "truncate audit_log",
      ]) {
        expect((await tryQuery(db, sql)).error).toMatch(/insert-only/);
      }
    });
  });

  it("app users cannot write to it directly, even the owner", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      for (const sql of [
        "insert into audit_log (action, table_name) values ('insert', 'fake')",
        "update audit_log set reason = 'tampered'",
        "delete from audit_log",
      ]) {
        expect((await tryQuery(db, sql)).error).toMatch(/permission denied/);
      }
    });
  });

  it("team members with 2FA can read it; without 2FA they see nothing", async () => {
    await withRollback(async (db) => {
      const viewer = await createUser(db, "viewer");
      await actAs(db, viewer, "aal2");
      expect(
        (await db.query("select count(*)::int as n from audit_log")).rows[0].n,
      ).toBeGreaterThan(0);
      await actAsAdmin(db);
      await actAs(db, viewer, "aal1");
      expect((await db.query("select count(*)::int as n from audit_log")).rows[0].n).toBe(0);
    });
  });
});
