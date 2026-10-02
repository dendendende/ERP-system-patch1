import Link from "next/link";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { LimitForm } from "./limit-form";

export const metadata = { title: "Health limits · Settings · Cashflow" };

// What each limit means, in plain words. "Danger when" is past the warning limit.
const SIGNALS: Record<string, { title: string; explain: string; unit: string; safe: string; warn: string }> = {
  runway: {
    title: "How long the cash lasts",
    explain: "Months the money in the bank lasts at your usual regular costs.",
    unit: "months",
    safe: "more than",
    warn: "less than",
  },
  net_cashflow: {
    title: "More coming in than going out",
    explain:
      "Average each month over the last 3. Below the safe line it's a warning; it becomes danger only when every one of the 3 months went out more than came in.",
    unit: "Rp a month",
    safe: "more than",
    warn: "",
  },
  late_share: {
    title: "Getting paid on time",
    explain: "Share of what customers owe that is more than 30 days late.",
    unit: "%",
    safe: "under",
    warn: "over",
  },
  renewal_rate: {
    title: "Customers renewing",
    explain: "Subscription bills from the last 12 months that were paid.",
    unit: "%",
    safe: "more than",
    warn: "less than",
  },
  top_customer_share: {
    title: "Relying on one customer",
    explain: "The biggest customer's share of the last 12 months' income from bills.",
    unit: "%",
    safe: "under",
    warn: "over",
  },
};

export default async function HealthLimitsPage() {
  const supabase = await createClient();
  const { data: limits, error } = await supabase
    .from("health_thresholds")
    .select("signal, healthy_limit, warning_limit");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="text-sm text-muted underline underline-offset-4">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Health limits</h1>
        <p className="text-muted">
          Where each check turns from healthy to &ldquo;keep an eye on it&rdquo; to &ldquo;needs
          attention&rdquo;. A change applies from the next daily check; past checks keep their result.
        </p>
      </div>
      {error ? <p className="text-sm text-problem">Couldn&apos;t load the limits. Try again.</p> : null}
      {Object.entries(SIGNALS).map(([signal, s]) => {
        const l = limits?.find((x) => x.signal === signal);
        if (!l) return null;
        return (
          <Card key={signal} className="flex flex-col gap-3">
            <div>
              <h2 className="font-display text-xl">{s.title}</h2>
              <p className="text-sm text-muted">{s.explain}</p>
            </div>
            <LimitForm
              signal={signal}
              healthy={Number(l.healthy_limit)}
              warning={l.warning_limit === null ? null : Number(l.warning_limit)}
              unit={s.unit}
              safeWord={s.safe}
              warnWord={s.warn}
            />
          </Card>
        );
      })}
    </div>
  );
}
