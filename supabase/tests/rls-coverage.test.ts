import { describe, expect, it } from "vitest";
import { withRollback } from "./db";

// P6-T3: lists anything in the app's schema that could leak around row-level security.
// A new table without RLS, a view that runs with its creator's rights, or anything the
// signed-out (anon) role can read fails here by name.
describe("row-level security covers everything", () => {
  it("every table has RLS switched on", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
          order by 1`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });

  it("every view runs with the reader's rights (security_invoker), so RLS applies through it", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('v', 'm')
            and not coalesce('security_invoker=true' = any (c.reloptions), false)
          order by 1`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });

  it("signed-out visitors can't read or write any table or view", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
            and has_table_privilege('anon', c.oid, 'select, insert, update, delete')
          order by 1`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });

  it("signed-out visitors can't run any function", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
          order by 1`,
      );
      expect(rows.map((r) => r.proname)).toEqual([]);
    });
  });

  it("views are read-only for the team", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'v'
            and has_table_privilege('authenticated', c.oid, 'insert, update, delete')
          order by 1`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });
});

// P9-T7: a bare current_app_role() or auth.uid() in a policy runs once for every row it checks
// (2s on Home at 50,000 bank rows). Wrapped in a sub-select it runs once per query.
describe("row-level security asks who you are once per query", () => {
  it("every policy wraps current_app_role() and auth.uid() in a sub-select", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select tablename || '.' || policyname as policy from pg_policies
          where schemaname = 'public'
            and replace(replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                                '( SELECT current_app_role() AS current_app_role)', ''),
                        '( SELECT auth.uid() AS uid)', '')
                ~ '(current_app_role|auth[.]uid)[(][)]'
          order by 1`,
      );
      expect(rows.map((r) => r.policy)).toEqual([]);
    });
  });
});
