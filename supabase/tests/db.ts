// DB test helper: every test runs inside a transaction that is rolled back, so tests never
// leave data behind. Needs the local database (`pnpm db:start`).
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function withRollback<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query("begin");
    return await fn(db);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}

/** withRollback, but with every existing rule switched off first (rolled back afterwards), so
 * rules people created in their local database never change what a test sees. */
export function withRulesOff<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  return withRollback(async (db) => {
    await db.query("update rules set is_active = false");
    return fn(db);
  });
}

export type Role = "owner" | "operator" | "viewer";

/** Creates an auth user (+ profile via trigger) with the given role. Run as postgres. */
export async function createUser(db: Client, role: Role): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)`,
    [id, `${id}@example.test`],
  );
  await db.query(`update public.users set role = $2 where id = $1`, [id, role]);
  return id;
}

/** Switch the session to act as this user through PostgREST's `authenticated` role. */
export async function actAs(db: Client, userId: string, aal: "aal1" | "aal2" = "aal2") {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated", aal }),
  ]);
  await db.query("set local role authenticated");
}

/** Back to postgres (superuser) for setup/inspection mid-test. */
export async function actAsAdmin(db: Client) {
  await db.query("reset role");
}

/** Runs `sql` in a savepoint and returns the error message, or null if it succeeded. */
export async function tryQuery(db: Client, sql: string, params: unknown[] = []) {
  await db.query("savepoint t");
  try {
    const res = await db.query(sql, params);
    await db.query("release savepoint t");
    return { error: null, rowCount: res.rowCount ?? 0 };
  } catch (e) {
    await db.query("rollback to savepoint t");
    return { error: (e as Error).message, rowCount: 0 };
  }
}
