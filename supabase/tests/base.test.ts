import { expect, it } from "vitest";
import { withRollback } from "./db";

it("jakarta_today() follows Asia/Jakarta, not the server timezone", async () => {
  await withRollback(async (db) => {
    await db.query("set local timezone = 'UTC'");
    const { rows } = await db.query(
      "select jakarta_today()::text as d, (now() at time zone 'Asia/Jakarta')::date::text as expected",
    );
    expect(rows[0].d).toBe(rows[0].expected);
  });
});
