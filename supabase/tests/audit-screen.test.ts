import { describe, expect, it } from "vitest";
import { TABLES, isReadableField } from "@/lib/audit-describe";
import { withRollback } from "./db";

// P6-T1 "every audited action displays readably": the audit screen must have plain words for
// every table that writes audit rows and every column it can log. A new audited table or
// column fails here until it gets words in src/lib/audit-describe.ts.
describe("audit screen covers every audited table", () => {
  it("has a name for each audited table and words for each of its columns", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ table_name: string; column_name: string }>(
        `select distinct c.relname as table_name, a.attname as column_name
           from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_proc p on p.oid = t.tgfoid
           join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          where p.proname = 'audit_row_change'`,
      );
      const tables = [...new Set(rows.map((r) => r.table_name))].sort();
      expect(tables.length).toBeGreaterThan(10);
      expect(tables.filter((t) => !(t in TABLES))).toEqual([]);
      expect(
        rows
          .filter((r) => !isReadableField(r.column_name))
          .map((r) => `${r.table_name}.${r.column_name}`),
      ).toEqual([]);
    });
  });
});

describe("audit rows name their record", () => {
  it("uses the primary key when a table has no id column (health limits)", async () => {
    await withRollback(async (db) => {
      await db.query(
        "update health_thresholds set healthy_limit = healthy_limit + 1 where signal = 'runway'",
      );
      const { rows } = await db.query(
        "select record_id from audit_log where table_name = 'health_thresholds' order by id desc limit 1",
      );
      expect(rows[0].record_id).toBe("runway");
    });
  });
});
