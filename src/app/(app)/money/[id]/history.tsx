import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

const FIELD_LABEL: Record<string, string> = {
  category_id: "Category",
  note: "Note",
  counterparty: "Who",
  is_recurring: "Repeats",
  status: "Status",
  customer_id: "Customer",
  invoice_id: "Invoice",
};

// Bookkeeping columns: who and when are shown on the line above, so repeating them is noise.
const HIDDEN_FIELDS = new Set(["updated_at", "updated_by", "rule_id"]);

const STATUS_WORDS: Record<string, string> = {
  needs_label: "needs a label",
  auto: "labelled by a rule",
  labelled: "labelled by someone",
};

/** Every change to this transaction's details, newest first, from the audit log — and, for money
 * entered by hand, who typed it in. */
export async function History({
  entryId,
  transactionId,
}: {
  entryId: string;
  transactionId: string;
}) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("audit_log")
    .select("id, actor_id, action, old_value, new_value, reason, created_at")
    .or(
      `and(table_name.eq.entries,record_id.eq.${entryId}),and(table_name.eq.bank_transactions,record_id.eq.${transactionId})`,
    )
    .order("id", { ascending: false })
    .limit(50);

  if (!rows?.length) {
    return <p className="text-sm text-muted">Nothing has been changed since it arrived.</p>;
  }

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))];
  const categoryIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.old_value, r.new_value].flatMap((v) => {
          const id = (v as Record<string, unknown> | null)?.category_id;
          return typeof id === "string" ? [id] : [];
        }),
      ),
    ),
  ];
  const [{ data: actors }, { data: categories }] = await Promise.all([
    actorIds.length
      ? supabase.from("users").select("id, name").in("id", actorIds)
      : Promise.resolve({ data: [] }),
    categoryIds.length
      ? supabase.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map((actors ?? []).map((a) => [a.id, a.name]));
  const categoryOf = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const show = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "nothing";
    if (field === "category_id") return categoryOf.get(String(value)) ?? "another category";
    if (field === "status") return STATUS_WORDS[String(value)] ?? String(value);
    if (typeof value === "boolean") return value ? "yes" : "no";
    return `"${String(value)}"`;
  };

  return (
    <ol className="flex flex-col gap-4">
      {rows.map((row) => {
        const typed = row.action === "insert" ? (row.new_value as Record<string, unknown>) : null;
        const changed = typed
          ? []
          : Object.keys((row.new_value as Record<string, unknown>) ?? {}).filter(
              (field) => !HIDDEN_FIELDS.has(field),
            );
        return (
          <li
            key={row.id}
            className="flex flex-col gap-1 border-b border-line pb-3 last:border-b-0 last:pb-0"
          >
            <p className="text-sm">
              <span className="font-medium">
                {row.actor_id
                  ? (nameOf.get(row.actor_id) ?? "Someone who left the team")
                  : "The app"}
              </span>{" "}
              <span className="text-muted">· {when.format(new Date(row.created_at))}</span>
            </p>
            {typed ? (
              <p className="text-sm text-muted">
                Entered by hand: money {typed.direction === "in" ? "in" : "out"},{" "}
                <span className="text-ink tabular-nums">
                  {formatRupiah(BigInt(String(typed.amount)))}
                </span>
              </p>
            ) : null}
            <ul className="text-sm text-muted">
              {changed.map((field) => (
                <li key={field}>
                  {FIELD_LABEL[field] ?? field}:{" "}
                  {show(field, (row.old_value as Record<string, unknown>)?.[field])} →{" "}
                  <span className="text-ink">
                    {show(field, (row.new_value as Record<string, unknown>)?.[field])}
                  </span>
                </li>
              ))}
            </ul>
            {row.reason ? <p className="text-sm">Reason: {row.reason}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
