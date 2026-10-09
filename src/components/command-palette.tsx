"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type FoundGroup, searchEverything } from "@/app/(app)/search-actions";
import { type Jump, matchJumps } from "@/lib/command-palette";
import { typingIn } from "@/lib/keys";

// Ctrl/⌘ K (or any button marked data-open-palette; or "/" on a page without its own search): one box to jump to a screen, do a common
// thing, or find a customer, bill or transaction. Arrow keys move, Enter opens, Esc closes.
// A native <dialog>: it keeps focus inside and closes on Esc by itself.

type Item = { label: string; sub: string; href: string };

export function CommandPalette({ jumps }: { jumps: Jump[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const asked = useRef(0);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const open = () => {
      setQ("");
      setFound([]);
      setActive(0);
      dialog.current?.showModal();
      input.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // "/": the page's own search box; a page without one gets this box
        if (e.defaultPrevented || typingIn(e.target) || dialog.current?.open) return;
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>('main input[type="search"]');
        if (search) {
          search.focus();
          search.select();
        } else open();
      }
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.("[data-open-palette]")) open();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const groups: { name: string; items: Item[] }[] = [
    {
      name: "Go to or do",
      items: matchJumps(jumps, q)
        .slice(0, q ? 6 : 8)
        .map((j) => ({ label: j.label, sub: j.hint, href: j.href })),
    },
    ...found,
  ].filter((g) => g.items.length > 0);
  const items = groups.flatMap((g) => g.items);
  const current = Math.min(active, items.length - 1);

  useEffect(() => {
    document.getElementById(`palette-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function type(value: string) {
    setQ(value);
    setActive(0);
    clearTimeout(timer.current);
    if (value.trim().length < 2) {
      asked.current++;
      setFound([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const mine = ++asked.current;
      const result = await searchEverything(value).catch(() => []);
      // an older, slower answer never replaces a newer one
      if (mine !== asked.current) return;
      setFound(result);
      setSearching(false);
    }, 200);
  }

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.current?.close();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[current]);
    }
  }

  let n = -1;
  return (
    <dialog
      ref={dialog}
      aria-label="Find or jump to"
      // a click on the dimmed backdrop (the dialog itself, outside its box) closes it
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40 open:animate-[rise_200ms_ease-out]"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4 shrink-0 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={input}
          role="combobox"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={items.length ? `palette-${current}` : undefined}
          aria-autocomplete="list"
          aria-label="Find a customer, bill, transaction or screen"
          placeholder="Find a customer, bill, transaction… or a screen"
          value={q}
          onChange={(e) => type(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none! placeholder:text-muted"
        />
        <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
      </div>
      <div
        id="palette-results"
        role="listbox"
        aria-label="Results"
        className="max-h-[60vh] overflow-y-auto p-2"
      >
        {groups.map((g) => (
          <div
            key={g.name}
            role="group"
            aria-labelledby={`palette-group-${g.name}`}
            className="pb-1"
          >
            <p
              id={`palette-group-${g.name}`}
              className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase"
            >
              {g.name}
            </p>
            {g.items.map((item) => {
              const i = ++n;
              return (
                <div
                  key={`${item.href}-${i}`}
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => i !== current && setActive(i)}
                  onClick={() => go(item)}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm ${i === current ? "bg-brand-soft text-brand-deep" : ""}`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{item.sub}</span>
                </div>
              );
            })}
          </div>
        ))}
        <p role="status" className="px-2 py-2 text-xs text-muted">
          {searching
            ? "Searching…"
            : q.trim().length >= 2 && found.length === 0
              ? `No customers, bills or transactions match “${q.trim()}”.`
              : q.trim().length < 2
                ? "Type 2 letters or more to find customers, bills and transactions."
                : ""}
        </p>
      </div>
    </dialog>
  );
}
