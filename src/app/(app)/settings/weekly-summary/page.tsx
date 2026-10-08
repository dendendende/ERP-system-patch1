import Link from "next/link";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { worstStatus } from "@/lib/health-status";
import { lastWeek, weeklySummaryText } from "@/lib/weekly-summary";
import { CopyText } from "./copy-text";

export const metadata = { title: "Weekly summary · Settings · Cashflow" };


export default async function WeeklySummaryPage() {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const week = lastWeek(today);
  const [summary, moves, late, health, markedPaid, mismatches] = await Promise.all([
    supabase.rpc("money_summary").single(),
    supabase.rpc("came_in_went_out", { p_from: week.from, p_to: week.to }).single(),
    supabase.from("customer_billing").select("name, still_owed::text").eq("is_late", true).order("still_owed", { ascending: false }),
    supabase.from("health_snapshots").select("taken_on, status").order("taken_on", { ascending: false }).limit(5),
    supabase
      .from("payments_without_transfer")
      .select("customer_name, number, amount_applied::text, reason")
      .gte("created_at", `${week.from}T00:00:00+07:00`)
      .lte("created_at", `${week.to}T23:59:59.999+07:00`),
    supabase
      .from("balance_checks")
      .select("checked_on, likely_cause, bank_accounts (bank_name, account_last4)")
      .eq("status", "mismatch")
      .gte("checked_on", week.from)
      .lte("checked_on", week.to)
      .order("checked_on", { ascending: false }),
  ]);

  // A summary that gets copied and sent must never be built from a failed read.
  const failed = [summary, moves, late, health, markedPaid, mismatches].find((r) => r.error);
  if (failed?.error) throw new Error(`Weekly summary didn't load: ${failed.error.message}`);

  const latest = (health.data ?? []).filter((h) => h.taken_on === health.data?.[0]?.taken_on);
  const worst = worstStatus(latest.map((h) => h.status));
  // one line per account: its most recent mismatch of the week
  const seen = new Set<string>();
  const accountMismatches = (mismatches.data ?? []).flatMap((m) => {
    const account = `${m.bank_accounts?.bank_name} ••${m.bank_accounts?.account_last4}`;
    if (seen.has(account)) return [];
    seen.add(account);
    return [{ account, cause: m.likely_cause }];
  });

  const text = weeklySummaryText({
    weekFrom: week.from,
    weekTo: week.to,
    cash: BigInt(String(summary.data?.cash_in_bank ?? "0")),
    cameIn: BigInt(String(moves.data?.came_in ?? "0")),
    wentOut: BigInt(String(moves.data?.went_out ?? "0")),
    late: (late.data ?? []).map((l) => ({ name: l.name ?? "", owed: BigInt(l.still_owed ?? "0") })),
    health: worst,
    markedPaid: (markedPaid.data ?? []).map((m) => ({
      customer: m.customer_name ?? "",
      number: m.number ?? "",
      amount: BigInt(m.amount_applied ?? "0"),
      reason: m.reason ?? "",
    })),
    mismatches: accountMismatches,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="text-sm text-muted underline underline-offset-4">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Weekly summary</h1>
        <p className="text-muted">
          Last week in one message. Automatic sending is on hold, so copy it into WhatsApp or email
          yourself — or ask Cowork to send it to you every Monday.
        </p>
      </div>
      <Card className="flex flex-col gap-4">
        <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
        <CopyText text={text} />
      </Card>
    </div>
  );
}
