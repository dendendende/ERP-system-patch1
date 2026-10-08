"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 20px line icons, drawn here (no icon library): one path set per page.
const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  money: "M7 4v16m0-16L3 8m4-4 4 4m6 12V4m0 16-4-4m4 4 4-4",
  customers:
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m10 9v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.15a3.5 3.5 0 0 1 0 6.7",
  health: "M3 12h4l3-7 4 14 3-7h4",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6m7.4-1.6.1-1.4-.1-1.4 2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.4-1.4L14.2 2h-4.4l-.4 2.6A7 7 0 0 0 7 6L4.6 5l-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.4 1.4l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2.4-1.4l2.4 1 2-3.4z",
} as const;

export const NAV = [
  { href: "/", label: "Home", short: "Home", icon: "home" },
  { href: "/money", label: "Money in & out", short: "Money", icon: "money" },
  { href: "/customers", label: "Customers & billing", short: "Customers", icon: "customers" },
  { href: "/health", label: "Business health", short: "Health", icon: "health" },
  { href: "/settings", label: "Settings", short: "Settings", icon: "settings" },
] as const;

function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The app's mark: a rising line in a blue tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 28 28" className={className}>
      <rect width="28" height="28" rx="7" className="fill-brand" />
      <path
        d="M6 18.5 11 13l4 3.5 7-8M17.5 8.5H22V13"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useIsActive() {
  const path = usePathname();
  return (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Sidebar on the dark navy panel: the current page is lit, with a blue edge. */
export function SidebarNav() {
  const isActive = useIsActive();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${focusRing} ${
            isActive(href)
              ? "bg-white/10 font-medium text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand-soft"
              : "text-nav-ink hover:bg-white/5 hover:text-white"
          }`}
        >
          <Icon name={icon} className="size-5 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar() {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {NAV.map(({ href, label, short, icon }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          aria-current={isActive(href) ? "page" : undefined}
          className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${focusRing} ${
            isActive(href) ? "font-medium text-brand" : "text-muted"
          }`}
        >
          <Icon name={icon} className="size-5" />
          {short}
        </Link>
      ))}
    </nav>
  );
}
