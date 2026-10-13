import Link from "next/link";
import type { ReactNode } from "react";
import { Card, StatusPill } from "@/components/ui";
import { type Role, canAccess } from "@/lib/auth/routes";
import { currentSyncState } from "@/lib/bank/current-sync";
import { worstStatus } from "@/lib/health-status";
import { loadSetupProgress } from "@/lib/setup-data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings · Cashflow" };

const SECTIONS = [
  ["Getting started", "/setup", "The seven setup steps, and which are done. Owner only."],
  ["Team", "/settings/team", "Who can use the app and what they can do. Owner only."],
  [
    "Bank connections",
    "/settings/bank",
    "Where your money data comes from, and whether it is up to date.",
  ],
  [
    "Categories & rules",
    "/settings/categories",
    "What your money is filed under, and the rules that label it automatically. Owner only.",
  ],
  [
    "Reminders",
    "/settings/reminders",
    "When customers hear from us about a bill, and what the messages say. Owner only.",
  ],
  [
    "Health limits",
    "/settings/health",
    "Where each business health check turns from healthy to warning to danger. Owner only.",
  ],
  [
    "Weekly summary",
    "/settings/weekly-summary",
    "Last week in one message, ready to copy or hand to Cowork. Owner only.",
  ],
  [
    "Parallel run",
    "/settings/parallel-run",
    "Before go-live: your numbers next to the app's, week by week. Owner only.",
  ],
  [
    "Change history",
    "/settings/audit-log",
    "Who changed what and when, with the value before. Owner only.",
  ],
] as const;

const HEALTH = {
  healthy: ["in", "Healthy"],
  warning: ["attention", "Needs watching"],
  danger: ["problem", "Needs attention"],
} as const;

const n = (count: number | null, one: string, more: string) =>
  `${(count ?? 0).toLocaleString("id-ID")} ${count === 1 ? one : more}`;

/** Where each setting stands now, in one short line. Only for what this person may open. */
async function figures(role: Role | null): Promise<Partial<Record<string, ReactNode>>> {
  const supabase = await createClient();
  const may = (href: string) => canAccess(role, href);
  const head = { count: "exact", head: true } as const;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [setup, people, accounts, sync, rules, steps, health, weeks, changes] = await Promise.all([
    may("/setup") ? loadSetupProgress() : null,
    may("/settings/team") ? supabase.from("users").select("id", head) : null,
    may("/settings/bank")
      ? supabase.from("bank_accounts").select("id", head).eq("is_active", true)
      : null,
    may("/settings/bank") ? currentSyncState() : null,
    may("/settings/categories")
      ? supabase.from("rules").select("id", head).eq("is_active", true)
      : null,
    may("/settings/reminders")
      ? supabase.from("reminder_schedule").select("id", head).eq("is_active", true)
      : null,
    may("/settings/health")
      ? supabase
          .from("health_snapshots")
          .select("taken_on, status")
          .order("taken_on", { ascending: false })
          .limit(10)
      : null,
    may("/settings/parallel-run")
      ? supabase.from("parallel_run_weeks").select("week_start", head)
      : null,
    may("/settings/audit-log")
      ? supabase.from("audit_log").select("id", head).gte("created_at", weekAgo)
      : null,
  ]);
  const latest = health?.data?.filter((h) => h.taken_on === health.data?.[0]?.taken_on) ?? [];
  const worst = worstStatus(latest.map((h) => h.status));
  // a failed read shows nothing, never a made-up 0
  const ok = (r: { error: unknown } | null) => r && !r.error;
  return {
    "/setup": setup && `${setup.doneCount} of ${setup.total} done`,
    "/settings/team": ok(people) && n(people!.count, "person", "people"),
    "/settings/bank": ok(accounts) && sync && (
      <>
        {n(accounts!.count, "account", "accounts")} ·{" "}
        <StatusPill tone={sync.tone}>{sync.message}</StatusPill>
      </>
    ),
    "/settings/categories": ok(rules) && `${n(rules!.count, "rule", "rules")} on`,
    "/settings/reminders": ok(steps) && `${n(steps!.count, "step", "steps")} on`,
    "/settings/health": worst ? (
      <StatusPill tone={HEALTH[worst][0]}>{HEALTH[worst][1]}</StatusPill>
    ) : null,
    "/settings/parallel-run": ok(weeks) && `${n(weeks!.count, "week", "weeks")} written down`,
    "/settings/audit-log":
      ok(changes) && `${n(changes!.count, "change", "changes")} in the last 7 days`,
  };
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_app_role");
  const now = await figures(role);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="font-display text-3xl md:text-4xl">Settings</h1>
      <Card className="p-0">
        {SECTIONS.map(([title, href, description]) => (
          <Link
            key={href}
            href={href}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-ground/60"
          >
            <span className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="text-sm text-muted">{description}</span>
            </span>
            {now[href] ? (
              <span className="flex items-center gap-1 text-sm tabular-nums">{now[href]}</span>
            ) : null}
          </Link>
        ))}
      </Card>
    </div>
  );
}
