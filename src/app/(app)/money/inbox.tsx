import { Button, Card, StatusPill } from "@/components/ui";
import { payeeFromDescription } from "@/lib/bank/payee";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { labelEntry } from "./label-actions";

const INBOX_SIZE = 5;

const jakartaDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
});

type Suggestion = { id: string; name: string };

/** Top of Money in & out: the transactions nobody has labelled yet. */
export async function NeedsLabelInbox() {
  const supabase = await createClient();
  const [{ data: items }, { count }, { data: categories }] = await Promise.all([
    supabase.rpc("needs_label_inbox", { p_limit: INBOX_SIZE }),
    supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_label"),
    supabase.from("categories").select("id, name, type").order("name"),
  ]);

  if (!items?.length) return null;

  return (
    <Card className="flex flex-col gap-4 border-attention/40 bg-attention-bg/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">Needs a label</h2>
        <p className="text-sm text-muted tabular-nums">
          {count ?? items.length} waiting · showing the {items.length} oldest
        </p>
      </div>

      {items.map((item) => {
        const suggestions = (item.suggestions ?? []) as Suggestion[];
        const payee = payeeFromDescription(item.description);
        const isIn = item.direction === "in";
        return (
          <form
            key={item.entry_id}
            action={labelEntry}
            className="flex flex-col gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0"
          >
            <input type="hidden" name="entryId" value={item.entry_id} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.description}</p>
                <p className="text-sm text-muted">
                  {jakartaDate.format(new Date(item.occurred_at))} · {item.account}
                </p>
              </div>
              <p className={`text-sm tabular-nums ${isIn ? "text-in" : ""}`}>
                {isIn ? "+" : "−"}
                {formatRupiah(BigInt(item.amount)).replace("−", "")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {suggestions.map((s) => (
                <Button key={s.id} type="submit" name="categoryId" value={s.id} variant="secondary">
                  {s.name}
                </Button>
              ))}
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-line px-4 py-2 text-sm">
                  Something else…
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    name="categoryIdOther"
                    defaultValue=""
                    className="h-10 rounded-lg border border-line bg-surface px-3 text-sm"
                    aria-label="Category"
                  >
                    <option value="" disabled>
                      Choose a category
                    </option>
                    {categories
                      ?.filter((c) => c.type === item.direction)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <Button type="submit">Save</Button>
                </div>
              </details>
            </div>

            {payee ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input type="checkbox" name="rule" className="size-4 accent-ink" defaultChecked />
                Label <span className="font-medium text-ink">{payee}</span> this way from now on
              </label>
            ) : (
              <StatusPill>No payee name to remember</StatusPill>
            )}
          </form>
        );
      })}
    </Card>
  );
}
