"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** The way into Notifications, with how many are new. Opening the centre clears the count. */
export function Bell({ count, onDark = false }: { count: number; onDark?: boolean }) {
  const [shown, setShown] = useState(count);
  // a fresh count from the server (after a refresh) replaces a cleared one
  const [given, setGiven] = useState(count);
  if (count !== given) {
    setGiven(count);
    setShown(count);
  }
  useEffect(() => {
    const clear = () => setShown(0);
    window.addEventListener("notifications-seen", clear);
    return () => window.removeEventListener("notifications-seen", clear);
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={shown ? `Notifications, ${shown} new` : "Notifications"}
      className={`relative grid size-9 shrink-0 place-items-center rounded-lg transition-colors ${
        onDark
          ? "text-nav-ink hover:bg-white/5 hover:text-white"
          : "text-muted hover:bg-ground hover:text-ink"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {shown ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-problem px-1 text-[10px] leading-4 font-semibold text-white tabular-nums"
        >
          {shown > 99 ? "99+" : shown}
        </span>
      ) : null}
    </Link>
  );
}
