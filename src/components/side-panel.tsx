"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef } from "react";

// The drill-down panel of a list page (P7-T6). What's open lives in the address (?open=…), so a
// panel can be linked, and Back closes it. Wide screens: beside the list, which stays put. Smaller
// screens: slides over from the right. Esc or × closes it; nothing in the list moves either way.

export function SidePanel({
  title,
  closeHref,
  children,
}: {
  title: string;
  /** The list's own address without the open item. */
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  // a newly opened item: move focus into the panel, so the keyboard and screen readers follow
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // an open menu (e.g. "Columns") closes first
      if ((e.target as HTMLElement | null)?.closest("details[open]")) return;
      router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <>
      {/* smaller screens: the list behind dims, and a tap on it closes the panel */}
      <Link
        href={closeHref}
        scroll={false}
        aria-hidden
        tabIndex={-1}
        className="panel-fade fixed inset-0 z-40 bg-nav/40 xl:hidden"
      />
      <aside
        aria-labelledby={headingId}
        className="panel-in fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl xl:sticky xl:top-6 xl:z-auto xl:max-h-[calc(100vh-3rem)] xl:max-w-none xl:rounded-xl xl:border xl:shadow-[0_1px_2px_rgb(16_38_95/0.04),0_12px_32px_-12px_rgb(16_38_95/0.18)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2
            ref={heading}
            id={headingId}
            tabIndex={-1}
            className="min-w-0 truncate font-display text-lg outline-none"
          >
            {title}
          </h2>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close the panel"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-xl text-muted transition-colors hover:bg-ground hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span aria-hidden>×</span>
          </Link>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </>
  );
}
