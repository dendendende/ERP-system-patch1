import Link from "next/link";
import { Button, Card, EmptyState } from "@/components/ui";
import { jakartaRange } from "@/app/(app)/money/filters";
import { TABLES, describeAudit, type Names } from "@/lib/audit-describe";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Change history · Settings · Cashflow" };

const PAGE_SIZE = 50;

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

// Which column names a row, for the tables whose ids can show up in the log.
const NAME_COLUMN: Record<string, string> = {
  users: "name",
  categories: "name",
  rules: "pattern",
  customers: "name",
  subscriptions: "plan_name",
  invoices: "number",
  recurring_expenses: "name",
  bank_transactions: "description_raw",
};
const REFERS_TO: Record<string, string> = {
  category_id: "categories",
  customer_id: "customers",
  invoice_id: "invoices",
  subscription_id: "subscriptions",
  bank_transaction_id: "bank_transactions",
};

const inputClass = "h-10 rounded-lg border border-line bg-surface px-3 text-sm";

export default async function AuditLogPage({ searchParams }: PageProps<"/settings/audit-log">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  const [person, table, from, to, record] = ["person", "table", "from", "to", "record"].map((k) =>
    one(params[k]),
  );
  const page = Math.max(1, Number(one(params.page)) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select(
      "id, actor_id, action, table_name, record_id, old_value, new_value, reason, created_at",
      {
        count: "exact",
      },
    )
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (person === "app") query = query.is("actor_id", null);
  else if (/^[0-9a-f-]{36}$/i.test(person)) query = query.eq("actor_id", person);
  if (table in TABLES) query = query.eq("table_name", table);
  const range = jakartaRange(from, to);
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lte("created_at", range.to);
  if (record) query = query.eq("record_id", record);

  const [{ data: rows, count, error }, { data: people }] = await Promise.all([
    query,
    supabase.from("users").select("id, name").order("name"),
  ]);

  // Look up a readable name for every id on this page: the records themselves and anything
  // they point to (category, customer, bill...).
  const wanted = new Map<string, Set<string>>();
  const want = (t: string, id: unknown) => {
    if (typeof id !== "string") return;
    if (!wanted.has(t)) wanted.set(t, new Set());
    wanted.get(t)!.add(id);
  };
  for (const r of rows ?? []) {
    if (r.record_id) want(r.table_name, r.record_id);
    for (const v of [r.old_value, r.new_value]) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const [field, target] of Object.entries(REFERS_TO)) want(target, v[field]);
    }
  }
  const names: Names = new Map((people ?? []).map((p) => [p.id, p.name]));
  const entryTransaction = new Map<string, string>();
  await Promise.all([
    ...[...wanted].map(async ([t, ids]) => {
      const column = NAME_COLUMN[t];
      if (!column) return;
      const { data } = await supabase
        .from(t as "users")
        .select(`id, ${column}`)
        .in("id", [...ids]);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) {
        names.set(row.id, row[column]);
      }
    }),
    (async () => {
      const ids = [...(wanted.get("bank_accounts") ?? [])];
      if (!ids.length) return;
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_last4")
        .in("id", ids);
      for (const a of data ?? []) names.set(a.id, `${a.bank_name} ••${a.account_last4}`);
    })(),
    (async () => {
      const ids = [...(wanted.get("entries") ?? [])];
      if (!ids.length) return;
      const { data } = await supabase
        .from("entries")
        .select("id, bank_transaction_id, bank_transactions (description_raw)")
        .in("id", ids);
      for (const e of data ?? []) {
        names.set(e.id, e.bank_transactions.description_raw);
        entryTransaction.set(e.id, e.bank_transaction_id);
      }
    })(),
  ]);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (changes: Record<string, string>) => {
    const next = new URLSearchParams(
      Object.entries({ person, table, from, to, record, ...changes }).filter(([, v]) => v),
    );
    const q = next.toString();
    return `/settings/audit-log${q ? `?${q}` : ""}`;
  };
  const screenFor = (tableName: string, id: string | null) =>
    !id
      ? null
      : tableName === "customers"
        ? `/customers/${id}`
        : tableName === "entries" && entryTransaction.has(id)
          ? `/money/${entryTransaction.get(id)}`
          : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="text-sm text-muted underline underline-offset-4">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Change history</h1>
        <p className="text-muted">
          Every change to money, customers, bills, settings and the team — who made it, when, and
          what it was before. Nothing here can be edited or removed.
        </p>
      </div>

      <form method="get" action="/settings/audit-log" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Who
          <select name="person" defaultValue={person} className={inputClass}>
            <option value="">Anyone</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="app">The app (automatic)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          What
          <select name="table" defaultValue={table} className={inputClass}>
            <option value="">Everything</option>
            {Object.entries(TABLES).map(([key, t]) => (
              <option key={key} value={key}>
                {t.plural}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            className={`${inputClass} tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input type="date" name="to" defaultValue={to} className={`${inputClass} tabular-nums`} />
        </label>
        {record ? <input type="hidden" name="record" value={record} /> : null}
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>

      {record ? (
        <p className="text-sm">
          Showing one record only ·{" "}
          <Link href={link({ record: "" })} className="underline underline-offset-4">
            show everything
          </Link>
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-problem">Couldn&apos;t load the change history. Try again.</p>
      ) : rows?.length ? (
        <>
          <p className="text-sm text-muted tabular-nums">
            {total.toLocaleString("id-ID")} {total === 1 ? "change" : "changes"}
            {lastPage > 1 ? ` · page ${page} of ${lastPage}` : ""}
          </p>
          <Card className="p-0">
            <ol>
              {rows.map((row) => {
                const d = describeAudit(row, names);
                const screen = screenFor(row.table_name, row.record_id);
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-1 border-b border-line px-5 py-4 last:border-b-0"
                  >
                    <p className="font-medium">{d.title}</p>
                    <p className="text-sm text-muted">
                      {row.actor_id
                        ? (names.get(row.actor_id) ?? "Someone who left the team")
                        : "The app"}{" "}
                      · {when.format(new Date(row.created_at))}
                    </p>
                    {d.changes.length ? (
                      <ul className="text-sm text-muted">
                        {d.changes.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    ) : null}
                    {row.reason ? <p className="text-sm">Reason: {row.reason}</p> : null}
                    {row.record_id ? (
                      <p className="flex gap-4 text-sm">
                        {record ? null : (
                          <Link
                            href={link({ record: row.record_id, table: row.table_name, page: "" })}
                            className="underline underline-offset-4"
                          >
                            All changes to this
                          </Link>
                        )}
                        {screen ? (
                          <Link href={screen} className="underline underline-offset-4">
                            Open
                          </Link>
                        ) : null}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Card>
          {lastPage > 1 ? (
            <nav className="flex items-center justify-between text-sm" aria-label="Pages">
              {page > 1 ? (
                <Link
                  href={link({ page: String(page - 1) })}
                  className="underline underline-offset-4"
                >
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              {page < lastPage ? (
                <Link
                  href={link({ page: String(page + 1) })}
                  className="underline underline-offset-4"
                >
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState title="No changes to show">
          {person || table || from || to || record
            ? "Nothing matches what you asked for. Try a wider date range or pick Anyone / Everything."
            : "Changes appear here as soon as anyone edits money, customers, bills or settings."}
        </EmptyState>
      )}
    </div>
  );
}
