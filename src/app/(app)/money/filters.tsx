import { Button } from "@/components/ui";

export const PAGE_SIZE = 50;

export type MoneyFilter = "all" | "in" | "out" | "matched";

const TABS: [MoneyFilter, string][] = [
  ["all", "All"],
  ["in", "Money in"],
  ["out", "Money out"],
  ["matched", "Matched to invoices"],
];

/** A date typed as YYYY-MM-DD means that whole day in Jakarta, not UTC. */
export function jakartaRange(from: string, to: string) {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  return {
    from: valid(from) ? `${from}T00:00:00+07:00` : null,
    to: valid(to) ? `${to}T23:59:59.999+07:00` : null,
  };
}

// Plain GET form: filtering works without JavaScript and every view has its own URL.
export function Filters({
  show,
  from,
  to,
  q,
}: {
  show: MoneyFilter;
  from: string;
  to: string;
  q: string;
}) {
  return (
    <form method="get" action="/money" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
        {TABS.map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface ${
              show === value ? "border-ink" : "border-line text-muted hover:border-muted/50"
            }`}
          >
            <input
              type="radio"
              name="show"
              value={value}
              defaultChecked={show === value}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Search
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Bank description"
            className="h-10 w-56 rounded-lg border border-line bg-surface px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm tabular-nums"
          />
        </label>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </div>
    </form>
  );
}
