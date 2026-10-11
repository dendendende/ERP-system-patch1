"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { type CsvCell, toCsv } from "@/lib/csv";
import { typingIn } from "@/lib/keys";
import { visibleRange } from "@/lib/virtual-rows";
import { Button } from "./ui";

// The list table (P7-T4): only the rows on screen are in the page, so 50,000 scroll as smoothly as
// 50. Rows are one fixed height (h-row, one line each) — that's what makes the windowing exact.

export type Sort = { key: string; dir: "asc" | "desc" };

export type Column<Row> = {
  key: string;
  label: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** For this column's cells, e.g. "w-full max-w-0 truncate" on the one that gives way. */
  className?: string;
  /** true: the server sorts it (see sortHref). A compare (ascending): sorted right here. */
  sort?: true | ((a: Row, b: Row) => number);
  /** Its value in the CSV; columns without one are left out of the file. */
  csv?: (row: Row) => CsvCell;
  footer?: ReactNode;
  /** Can be switched off under "Columns". */
  optional?: boolean;
};

const OVERSCAN = 10;
const FIRST_PAINT = 60;

export function DataTable<Row>({
  id,
  label,
  rows,
  rowKey,
  columns,
  sort: serverSort,
  sortHref,
  csvHref,
  bulkActions,
  toolbar,
  activeKey,
}: {
  /** Remembers which columns this person switched off. */
  id: string;
  /** What the table lists, for screen readers. */
  label: string;
  rows: Row[];
  rowKey: (row: Row) => string;
  columns: Column<Row>[];
  /** Server-sorted lists: the current sort, and the link for a header. */
  sort?: Sort;
  sortHref?: (sort: Sort) => string;
  /** The server's CSV of the whole list. Without it, the rows here download as they're shown. */
  csvHref?: string;
  /**
   * Adds tick boxes; this renders the actions for what's ticked. `say` leaves a line of words
   * above the table (how a bulk action went), which stays after the ticks are cleared.
   */
  bulkActions?: (selected: Row[], clear: () => void, say: (words: string) => void) => ReactNode;
  /** Left of the table's controls, e.g. "1,204 transactions". */
  toolbar?: ReactNode;
  /** The row open in the side panel: marked, so the eye finds its place in the list. */
  activeKey?: string;
}) {
  const [localSort, setLocalSort] = useState<
    (Sort & { compare: (a: Row, b: Row) => number }) | null
  >(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [said, say] = useState("");
  const [view, setView] = useState({ start: 0, end: FIRST_PAINT, h: 40 });
  const body = useRef<HTMLTableSectionElement>(null);

  const storeKey = `table:${id}:hidden`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
      if (Array.isArray(saved)) setHidden(saved.filter((k) => typeof k === "string"));
    } catch {}
  }, [storeKey]);
  const toggleColumn = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {}
  };

  const shownColumns = columns.filter((c) => !hidden.includes(c.key));
  const sort = sortHref ? serverSort : localSort;
  // keyed on the compare picked at click time, so re-renders while scrolling never re-sort
  const shown = useMemo(() => {
    if (!localSort) return rows;
    const sign = localSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => sign * localSort.compare(a, b));
  }, [rows, localSort]);

  // which rows are on screen: the page scrolls, not the table
  const count = shown.length;
  useEffect(() => {
    const update = () => {
      const el = body.current;
      if (!el) return;
      const h = el.querySelector<HTMLElement>("tr[data-row]")?.offsetHeight || 40;
      const r = visibleRange(
        -el.getBoundingClientRect().top,
        window.innerHeight,
        h,
        count,
        OVERSCAN,
      );
      setView((v) => (v.start === r.start && v.end === r.end && v.h === h ? v : { ...r, h }));
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [count]);
  const start = Math.min(view.start, count);
  const end = Math.min(view.end, count);

  // Keyboard (P7-T10): j / k move to the next / previous row (Enter then opens its link); with a
  // row open in the side panel they open the next / previous one there. Closing the panel puts
  // focus back on the row it came from. A row may not be drawn yet (only the rows on screen are),
  // so the page scrolls to it first and it's focused once it's there.
  const pending = useRef<{ index: number; open: boolean } | null>(null);
  const indexOf = (key: string) => shown.findIndex((r) => rowKey(r) === key);

  const focusPending = useEffectEvent(() => {
    const want = pending.current;
    const row =
      want && body.current?.querySelector<HTMLElement>(`tr[aria-rowindex="${want.index + 2}"]`);
    if (!want || !row) return;
    pending.current = null;
    const link = row.querySelector<HTMLElement>("a[href]");
    (link ?? row).focus({ preventScroll: true });
    // now that it's drawn, settle it in view (its scroll margins keep it off the sticky header)
    row.scrollIntoView({ block: "nearest", behavior: "instant" });
    if (want.open) link?.click();
  });
  const goTo = useEffectEvent((index: number, open: boolean) => {
    const el = body.current;
    if (!el) return;
    pending.current = { index, open };
    const h = view.h;
    const top = el.getBoundingClientRect().top + index * h;
    const header = el.parentElement?.querySelector("thead")?.offsetHeight ?? h;
    // keep the row clear of the sticky header and of the phone's tab bar
    if (top < header) window.scrollBy(0, top - header - h);
    else if (top + h > window.innerHeight - 64)
      window.scrollBy(0, top + h * 2 - window.innerHeight + 64);
    focusPending();
  });
  // after each draw: the row asked for may be on screen now
  useEffect(() => focusPending());

  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if ((e.key !== "j" && e.key !== "k") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.defaultPrevented || typingIn(e.target) || document.querySelector("dialog[open]")) return;
    if (!count) return;
    const focused = (document.activeElement as HTMLElement | null)?.closest("tr[data-row]");
    // a row asked for but not drawn yet counts as where we are: held-down keys don't get lost
    const from = pending.current
      ? pending.current.index
      : activeKey
        ? indexOf(activeKey)
        : focused && body.current?.contains(focused)
          ? Number(focused.getAttribute("aria-rowindex")) - 2
          : -1;
    const to = from === -1 ? 0 : Math.min(count - 1, Math.max(0, from + (e.key === "j" ? 1 : -1)));
    if (to === from) return;
    e.preventDefault();
    goTo(to, Boolean(activeKey));
  });
  useEffect(() => {
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  // the panel closed and focus fell to the page: back to the row that was open
  const restore = useEffectEvent((was: string) => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const index = indexOf(was);
    if (index !== -1) goTo(index, false);
  });
  const wasActive = useRef(activeKey);
  useEffect(() => {
    const was = wasActive.current;
    wasActive.current = activeKey;
    if (was && !activeKey) restore(was);
  }, [activeKey]);

  const nextSort = (key: string): Sort => ({
    key,
    dir: sort?.key === key && sort.dir === "desc" ? "asc" : "desc",
  });
  const arrow = (key: string) => (sort?.key !== key ? "" : sort.dir === "desc" ? " ↓" : " ↑");

  // nothing ticked (the usual case): skip walking every row on each render
  const ticked = bulkActions && selected.size ? shown.filter((r) => selected.has(rowKey(r))) : [];
  const allTicked = count > 0 && ticked.length === count;
  const someTicked = ticked.length > 0;
  const tick = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const clear = () => setSelected(new Set());

  const csvColumns = shownColumns.filter((c) => c.csv);
  const downloadCsv = () => {
    const text = toCsv(
      csvColumns.map((c) => c.label),
      shown.map((r) => csvColumns.map((c) => c.csv!(r))),
    );
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${id}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const span = shownColumns.length + (bulkActions ? 1 : 0);
  const hasFooter = shownColumns.some((c) => c.footer !== undefined);
  const optional = columns.filter((c) => c.optional);
  const alignClass = (c: Column<Row>) => (c.align === "right" ? "text-right" : "text-left");

  return (
    <div className="flex flex-col gap-2">
      {bulkActions ? (
        <p role="status" className="text-sm empty:hidden">
          {said}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <div>{toolbar}</div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs lg:inline">
            <kbd className={kbd}>j</kbd> <kbd className={kbd}>k</kbd> move ·{" "}
            <kbd className={kbd}>Enter</kbd> open · <kbd className={kbd}>/</kbd> search
          </span>
          {optional.length ? (
            <details className="relative">
              <summary className="cursor-pointer list-none underline underline-offset-4">
                Columns
              </summary>
              <fieldset className="absolute right-0 z-20 mt-2 flex w-48 flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-ink shadow-sm">
                <legend className="sr-only">Columns to show</legend>
                {optional.map((c) => (
                  <label key={c.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      checked={!hidden.includes(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </fieldset>
            </details>
          ) : null}
          {csvHref ? (
            <a href={csvHref} download className="underline underline-offset-4">
              Download CSV
            </a>
          ) : csvColumns.length ? (
            <button type="button" onClick={downloadCsv} className="underline underline-offset-4">
              Download CSV
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface">
        {/* clip, not scroll, on wider screens: a scrolling box would stop the header sticking */}
        <div className="overflow-x-auto md:overflow-x-clip">
          <table
            className="w-full border-collapse text-table tabular-nums"
            aria-rowcount={count + 1 + (hasFooter ? 1 : 0)}
          >
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr aria-rowindex={1}>
                {bulkActions ? (
                  <th scope="col" className={`${headCell} w-10`}>
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      aria-label={allTicked ? "Untick all" : "Tick all"}
                      checked={allTicked}
                      ref={(el) => {
                        if (el) el.indeterminate = someTicked && !allTicked;
                      }}
                      onChange={() =>
                        setSelected(allTicked ? new Set() : new Set(shown.map(rowKey)))
                      }
                    />
                  </th>
                ) : null}
                {shownColumns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      sort?.key === c.key
                        ? sort.dir === "desc"
                          ? "descending"
                          : "ascending"
                        : undefined
                    }
                    className={`${headCell} ${alignClass(c)} ${c.className ?? ""}`}
                  >
                    {!c.sort ? (
                      c.label
                    ) : sortHref ? (
                      <Link href={sortHref(nextSort(c.key))} className="hover:text-ink">
                        {c.label}
                        {arrow(c.key)}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          typeof c.sort === "function" &&
                          setLocalSort({ ...nextSort(c.key), compare: c.sort })
                        }
                        className="font-medium hover:text-ink"
                      >
                        {c.label}
                        {arrow(c.key)}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={body}>
              <tr aria-hidden style={{ height: start * view.h }}>
                <td colSpan={span} className="p-0" />
              </tr>
              {shown.slice(start, end).map((r, i) => {
                const key = rowKey(r);
                const on = selected.has(key);
                const active = key === activeKey;
                return (
                  <tr
                    key={key}
                    data-row
                    aria-rowindex={start + i + 2}
                    aria-selected={bulkActions ? on : undefined}
                    aria-current={active ? "true" : undefined}
                    tabIndex={-1}
                    className={`scroll-mt-12 scroll-mb-20 whitespace-nowrap transition-colors outline-none has-[:focus-visible]:bg-ground focus-visible:bg-ground ${active ? "bg-brand-soft shadow-[inset_3px_0_0_var(--color-brand)]" : on ? "bg-ground hover:bg-ground/60" : "hover:bg-ground/60"}`}
                  >
                    {bulkActions ? (
                      <td className={bodyCell}>
                        <input
                          type="checkbox"
                          className="size-4 accent-ink"
                          aria-label="Tick this row"
                          checked={on}
                          onChange={() => tick(key)}
                        />
                      </td>
                    ) : null}
                    {shownColumns.map((c) => (
                      <td
                        key={c.key}
                        className={`${bodyCell} ${alignClass(c)} ${c.className ?? ""}`}
                      >
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr aria-hidden style={{ height: (count - end) * view.h }}>
                <td colSpan={span} className="p-0" />
              </tr>
            </tbody>
            {hasFooter ? (
              <tfoot>
                <tr aria-rowindex={count + 2} className="font-medium whitespace-nowrap">
                  {bulkActions ? <td className={footCell} /> : null}
                  {shownColumns.map((c) => (
                    <td key={c.key} className={`${footCell} ${alignClass(c)} ${c.className ?? ""}`}>
                      {c.footer}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {ticked.length ? (
        <div
          role="region"
          aria-label="Ticked rows"
          className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-nav bg-nav px-4 py-2.5 text-sm text-surface [--focus-ring:var(--color-surface)] shadow-sm md:bottom-4"
        >
          <span className="tabular-nums">{ticked.length.toLocaleString("id-ID")} ticked</span>
          {bulkActions!(ticked, clear, say)}
          <Button type="button" variant="secondary" onClick={clear} className="ml-auto h-8">
            Untick all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const kbd = "rounded border border-line bg-surface px-1 font-sans text-[11px]";
const headCell =
  "sticky top-0 z-10 h-row border-b border-line bg-surface px-3 font-medium whitespace-nowrap text-muted first:rounded-tl-xl last:rounded-tr-xl";
const bodyCell = "h-row border-b border-line px-3";
const footCell = "h-row px-3";
