import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

describe("failed-attempt limits", () => {
  it("blocks after the allowed number of failures, and only within the window", async () => {
    await withRollback(async (db) => {
      const blocked = async (max: number) =>
        (await db.query("select public.too_many_failures('t:key', $1, 900) b", [max])).rows[0].b;
      expect(await blocked(3)).toBe(false);
      for (let i = 0; i < 3; i++) await db.query("select public.record_failure('t:key', 900)");
      expect(await blocked(4)).toBe(false);
      expect(await blocked(3)).toBe(true);

      // window over: blocked no more, and the next failure starts a new count
      await db.query(
        "update rate_limits set window_start = now() - interval '16 minutes' where key = 't:key'",
      );
      expect(await blocked(3)).toBe(false);
      await db.query("select public.record_failure('t:key', 900)");
      expect(
        (await db.query("select failures from rate_limits where key = 't:key'")).rows[0].failures,
      ).toBe(1);
    });
  });

  it("only the server can use them — the team and visitors can't read or reset counts", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      expect((await tryQuery(db, "select public.record_failure('x', 900)")).error).toMatch(
        /permission denied/,
      );
      expect((await tryQuery(db, "delete from rate_limits")).error).toMatch(/permission denied/);
    });
  });
});

describe("new-device sign-ins", () => {
  it("people record their own device; only the owner reads them; nobody edits them", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      const operator = await createUser(db, "operator");

      await actAs(db, operator);
      await db.query("insert into sign_in_devices (user_id, device_id) values ($1, $2)", [
        operator,
        randomUUID(),
      ]);
      const forSomeoneElse = await tryQuery(
        db,
        "insert into sign_in_devices (user_id, device_id) values ($1, $2)",
        [owner, randomUUID()],
      );
      expect(forSomeoneElse.error).toMatch(/row-level security/);
      expect((await db.query("select count(*)::int n from sign_in_devices")).rows[0].n).toBe(0);

      await actAs(db, operator, "aal1");
      const before2fa = await tryQuery(
        db,
        "insert into sign_in_devices (user_id, device_id) values ($1, $2)",
        [operator, randomUUID()],
      );
      expect(before2fa.error).toMatch(/row-level security/);

      await actAs(db, owner);
      const { rows } = await db.query("select user_id from sign_in_devices where user_id = $1", [
        operator,
      ]);
      expect(rows).toHaveLength(1);

      await actAsAdmin(db);
      expect((await tryQuery(db, "delete from sign_in_devices")).error).toMatch(/insert-only/);
    });
  });
});
