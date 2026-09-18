"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/money", label: "Money in & out", short: "Money" },
  { href: "/customers", label: "Customers & billing", short: "Customers" },
  { href: "/health", label: "Business health", short: "Health" },
  { href: "/settings", label: "Settings", short: "Settings" },
] as const;

function useIsActive() {
  const path = usePathname();
  return (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function SidebarNav() {
  const isActive = useIsActive();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-sm transition-colors ${focusRing} ${
            isActive(href)
              ? "bg-surface font-medium text-ink shadow-sm"
              : "text-muted hover:bg-line/50 hover:text-ink"
          }`}
        >
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
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map(({ href, label, short }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          aria-current={isActive(href) ? "page" : undefined}
          className={`flex h-14 flex-col items-center justify-center gap-1 text-xs transition-colors ${focusRing} ${
            isActive(href) ? "font-medium text-ink" : "text-muted"
          }`}
        >
          <span
            aria-hidden
            className={`h-1 w-6 rounded-full transition-colors ${isActive(href) ? "bg-ink" : "bg-transparent"}`}
          />
          {short}
        </Link>
      ))}
    </nav>
  );
}
