import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

const ADD =
  "insert into categories (name, type, report_group) values ($1, $2, 'other') returning id";

describe("categories", () => {
  it("ships the standard categories", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        "select name, type from categories where is_system order by type, name",
      );
      expect(rows.map((r) => `${r.type}:${r.name}`)).toEqual([
        "in:Other income",
        "in:Partial payment",
        "in:Subscription income",
        "in:Transfer between own accounts",
        "out:Bank fees",
        "out:Equipment",
        "out:Internet",
        "out:Marketing",
        "out:Office supplies",
        "out:Other",
        "out:Rent",
        "out:Salary",
        "out:Servers & hosting",
        "out:Software",
        "out:Transfer between own accounts",
      ]);
    });
  });

  it("the owner can add, rename and remove their own categories (audited)", async () => {
    await withRollback(async (db) => {
      const owner = await createUser(db, "owner");
      await actAs(db, owner);
      const { rows } = await db.query(ADD, ["Travel", "out"]);
      const id = rows[0].id;
      expect(
        (await tryQuery(db, "update categories set name = 'Trips' where id = $1", [id])).rowCount,
      ).toBe(1);
      expect((await tryQuery(db, "delete from categories where id = $1", [id])).rowCount).toBe(1);

      await actAsAdmin(db);
      const { rows: log } = await db.query(
        "select action from audit_log where record_id = $1 order by id",
        [id],
      );
      expect(log.map((r) => r.action)).toEqual(["insert", "update", "delete"]);
    });
  });

  it("operators and viewers cannot add categories", async () => {
    await withRollback(async (db) => {
      for (const role of ["operator", "viewer"] as const) {
        await actAsAdmin(db);
        await actAs(db, await createUser(db, role));
        expect((await tryQuery(db, ADD, [`Nope ${role}`, "out"])).error).toMatch(
          /row-level security/,
        );
      }
    });
  });

  it("built-in categories can't be changed, removed, or faked — even by the owner", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "owner"));
      expect(
        (await tryQuery(db, "update categories set name = 'x' where name = 'Salary'")).rowCount,
      ).toBe(0);
      expect((await tryQuery(db, "delete from categories where name = 'Salary'")).rowCount).toBe(0);
      expect(
        (
          await tryQuery(
            db,
            "insert into categories (name, type, report_group, is_system) values ('Fake', 'out', 'other', true)",
          )
        ).error,
      ).toMatch(/row-level security/);
    });
  });

  it("names are unique per direction", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "owner"));
      expect((await tryQuery(db, ADD, ["Salary", "out"])).error).toMatch(/unique/);
      expect((await tryQuery(db, ADD, ["Salary", "in"])).error).toBeNull(); // e.g. a salary refund
    });
  });
});
