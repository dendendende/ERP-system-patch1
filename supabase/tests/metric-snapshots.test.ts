import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

const insert =
  "insert into metric_snapshots (taken_on, metric, rupiah, value) values ('2031-01-01', 'cash', 5, null)";

describe("metric_snapshots", () => {
  it("only the daily job writes; everyone with a role reads; nobody without one", async () => {
    await withRollback(async (db) => {
      await db.query("set local role service_role");
      expect((await tryQuery(db, insert)).error).toBeNull();
      expect(
        (await tryQuery(db, `${insert} on conflict (taken_on, metric) do update set rupiah = 6`))
          .error,
      ).toBeNull();
      await actAsAdmin(db);

      for (const role of ["owner", "operator", "viewer"] as const) {
        await actAs(db, await createUser(db, role));
        const { rows } = await db.query(
          "select rupiah from metric_snapshots where taken_on = '2031-01-01'",
        );
        expect(rows, role).toEqual([{ rupiah: "6" }]);
        expect((await tryQuery(db, insert.replace("2031", "2032"))).error, role).toMatch(
          /permission denied/,
        );
        await actAsAdmin(db);
      }

      await actAs(db, await createUser(db, "owner"), "aal1"); // 2-step sign-in not done
      expect((await db.query("select * from metric_snapshots")).rows).toEqual([]);
    });
  });

  it("a number is rupiah or a ratio, never both", async () => {
    await withRollback(async (db) => {
      const both = await tryQuery(
        db,
        "insert into metric_snapshots (taken_on, metric, rupiah, value) values ('2031-01-01', 'x', 1, 1)",
      );
      expect(both.error).toMatch(/check constraint/);
    });
  });
});
