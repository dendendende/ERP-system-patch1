import { canAccess, type Role } from "@/lib/auth/routes";

// What the command palette (Ctrl/⌘ K) can jump to without asking the database: every screen and
// the common things to do. Each one is only offered to people who may open it.

export type Jump = { label: string; href: string; hint: string; words?: string };

export const JUMPS: Jump[] = [
  { label: "Record money in", href: "/money/new?dir=in", hint: "Do", words: "add cash received" },
  {
    label: "Record money out",
    href: "/money/new?dir=out",
    hint: "Do",
    words: "add cash paid spend",
  },
  { label: "Import a bank statement", href: "/money/import", hint: "Do", words: "csv upload" },
  {
    label: "Label transactions",
    href: "/money?status=needs_label",
    hint: "Do",
    words: "inbox needs a label category",
  },
  {
    label: "See who is late paying",
    href: "/customers?show=late",
    hint: "Do",
    words: "overdue owed",
  },
  { label: "Home", href: "/", hint: "Screen", words: "dashboard today" },
  {
    label: "Notifications",
    href: "/notifications",
    hint: "Screen",
    words: "alerts mismatch failed new payee",
  },
  { label: "Money in & out", href: "/money", hint: "Screen", words: "transactions bank" },
  {
    label: "Regular costs",
    href: "/money/regular-costs",
    hint: "Screen",
    words: "recurring expenses",
  },
  { label: "Customers & billing", href: "/customers", hint: "Screen", words: "clients" },
  { label: "Bills", href: "/customers/bills", hint: "Screen", words: "invoices owed late aging" },
  {
    label: "Reports",
    href: "/reports",
    hint: "Screen",
    words: "report print pdf excel favourites",
  },
  { label: "Renewals", href: "/customers/renewals", hint: "Screen", words: "subscriptions" },
  { label: "Cash forecast", href: "/forecast", hint: "Screen", words: "runway future" },
  { label: "Business health", href: "/health", hint: "Screen", words: "score" },
  { label: "Settings", href: "/settings", hint: "Screen" },
  { label: "Bank connections", href: "/settings/bank", hint: "Settings", words: "sync" },
  { label: "Categories & rules", href: "/settings/categories", hint: "Settings", words: "labels" },
  { label: "Reminders", href: "/settings/reminders", hint: "Settings", words: "whatsapp email" },
  { label: "Team", href: "/settings/team", hint: "Settings", words: "users people roles invite" },
  { label: "Change history", href: "/settings/audit-log", hint: "Settings", words: "audit log" },
  { label: "Health limits", href: "/settings/health", hint: "Settings", words: "thresholds" },
  { label: "Weekly summary", href: "/settings/weekly-summary", hint: "Settings", words: "email" },
  { label: "Parallel run", href: "/settings/parallel-run", hint: "Settings" },
  { label: "Getting started", href: "/setup", hint: "Settings", words: "setup" },
];

/** The jumps this person may open. Decided on the server, where the role rules are set. */
export const jumpsFor = (role: Role | null | undefined) =>
  JUMPS.filter((j) => canAccess(role, new URL(j.href, "http://x").pathname));

/** The jumps where every typed word starts a word of the name (or of its other words). */
export function matchJumps(jumps: Jump[], q: string): Jump[] {
  const typed = q.toLowerCase().split(/\s+/).filter(Boolean);
  return jumps.filter((j) => {
    const words = `${j.label} ${j.words ?? ""}`.toLowerCase().split(/[^a-z0-9]+/);
    return typed.every((t) => words.some((w) => w.startsWith(t)));
  });
}

/** A `%…%` pattern for ilike that finds the text as typed: % _ and \ match only themselves. */
export const containsPattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
