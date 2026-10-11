// P9-T7: 50,000 made-up bank transactions in the LOCAL database, to time the app at size.
//   node scripts/perf-data.mjs add      — one extra account "Perf 0000", two years of rows
//   node scripts/perf-data.mjs remove   — takes that account and everything on it out again
// Local only: refuses any database that isn't on this machine. Rows go in with triggers off
// (session_replication_role = replica), so they skip the audit log and the rules — they're
// timing data, not money anyone entered. Then `e2e/perf.spec.ts` times the pages (it skips
// without them). Remove them before `pnpm test`: matching re-reads 16,666 unmatched transfers.
import pg from "pg";

const URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";
const ACCOUNT = "00000000-0000-4000-8000-00000000fe0f";
const ROWS = 50_000;

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(URL))
  throw new Error("perf-data only runs on a local database");
const what = process.argv[2];
if (what !== "add" && what !== "remove") throw new Error("say add or remove");

const db = new pg.Client({ connectionString: URL });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local session_replication_role = replica");
  await db.query(
    `delete from public.entries where bank_transaction_id in
       (select id from public.bank_transactions where bank_account_id = $1)`,
    [ACCOUNT],
  );
  await db.query("delete from public.balance_checks where bank_account_id = $1", [ACCOUNT]);
  await db.query("delete from public.bank_transactions where bank_account_id = $1", [ACCOUNT]);
  await db.query("delete from public.bank_accounts where id = $1", [ACCOUNT]);

  if (what === "add") {
    await db.query(
      `insert into public.bank_accounts (id, bank_name, account_name, account_last4, source)
       values ($1, 'Perf', 'Timing data', '0000', 'csv')`,
      [ACCOUNT],
    );
    // two years back from today, spread evenly; 1 in 3 came in; 300 customers, 400 payees
    await db.query(
      `insert into public.bank_transactions
         (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
       select $1, 'perf-' || n,
              now() - (n * interval '730 days' / $2),
              case when n % 3 = 0 then 100000 + (n * 7919 % 400) * 160000
                   else 50000 + (n * 104729 % 600) * 50000 end,
              case when n % 3 = 0 then 'in' else 'out' end,
              case when n % 3 = 0 then 'TRSF E-BANKING CR PERF CUSTOMER ' || (n % 300)
                   else 'TRSF E-BANKING DB PERF PAYEE ' || (n % 400) end
         from generate_series(1::bigint, $2) n`,
      [ACCOUNT, ROWS],
    );
    // a running balance, oldest first, as a bank statement has it
    await db.query(
      `update public.bank_transactions t set balance_after = b.bal
         from (select id, 5000000000 + sum(case direction when 'in' then amount else -amount end)
                        over (order by occurred_at, id) bal
                 from public.bank_transactions where bank_account_id = $1) b
        where t.id = b.id`,
      [ACCOUNT],
    );
    // labels: 1 in 20 still needs one; the rest spread over the ordinary categories
    await db.query(
      `with cats as (
         select type, array_agg(id order by name) ids from public.categories
          where report_group <> 'transfer' group by type)
       insert into public.entries (bank_transaction_id, category_id, status)
       select t.id,
              case when hashtext(t.id::text) % 20 = 0 then null
                   else c.ids[1 + abs(hashtext(t.external_id)) % array_length(c.ids, 1)] end,
              case when hashtext(t.id::text) % 20 = 0 then 'needs_label' else 'auto' end
         from public.bank_transactions t join cats c on c.type = t.direction
        where t.bank_account_id = $1`,
      [ACCOUNT],
    );
  }
  await db.query("commit");
  await db.query("analyze public.bank_transactions; analyze public.entries");
  const { rows } = await db.query(
    "select count(*)::int n from public.bank_transactions where bank_account_id = $1",
    [ACCOUNT],
  );
  console.log(
    `${what === "add" ? "Added" : "Removed"}: the perf account now has ${rows[0].n} rows`,
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  throw e;
} finally {
  await db.end();
}
