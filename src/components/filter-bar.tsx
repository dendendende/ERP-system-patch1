import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";

// Filter bar for list pages (v2). A plain GET form: filters live in the address bar, so every
// view has its own link and works without JavaScript. Active filters show as chips; each chip
// removes only itself.

export const filterInput =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink transition-colors hover:border-muted/50";

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export function FilterBar({
  action,
  chips,
  clearHref,
  keep = {},
  children,
}: {
  action: string;
  chips: { label: string; href: string }[];
  clearHref: string;
  /** Values the form doesn't show but must keep, e.g. the sort order. */
  keep?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
      aria-label="Filters"
    >
      {Object.entries(keep).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <Button type="submit" variant="secondary" className="h-9">
          Apply
        </Button>
      </div>
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Showing only:</span>
          <ul className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.label}>
                <Link
                  href={chip.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-2.5 py-0.5 text-xs text-brand-deep transition-colors hover:border-brand/50"
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  {chip.label}
                  <span aria-hidden className="text-muted">
                    ×
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={clearHref} className="text-xs underline underline-offset-4">
            Clear all
          </Link>
        </div>
      ) : null}
    </form>
  );
}
