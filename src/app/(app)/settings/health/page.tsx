import Link from "next/link";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { LimitForm } from "./limit-form";

export const metadata = { title: "Health limits · Settings · Cashflow" };

// What each limit means, in plain words. "Danger when" is past the warning limit.
const SIGNALS: Record<
  string,
  { title: string; explain: string; unit: string; safe: string; warn: string }
> = {
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
  forecast_low: {
    title: "Lowest point in the next 90 days",
    explain:
      "The least money the forecast expects you to have. Set the floor you never want to go below.",
    unit: "Rp",
    safe: "above",
    warn: "below",
  },
  forecast_off: {
    title: "How close the forecast was",
    explain:
      "After each month: how far the forecast made on the 1st was off, as a share of the money it expected to move.",
    unit: "%",
    safe: "off by under",
    warn: "off by over",
  },
  overdue_share: {
    title: "Bills past their due date",
    explain: "Share of what customers owe that is past its due date, by any number of days.",
    unit: "%",
    safe: "under",
    warn: "over",
  },
  over_90_share: {
    title: "Bills more than 90 days late",
    explain: "Share of what customers owe that is more than 90 days late — the money most at risk.",
    unit: "%",
    safe: "under",
    warn: "over",
  },
  dso: {
    title: "Days customers take to pay",
    explain:
      "What customers owe, measured in days of billing (last 90 days). Subscription businesses usually sit at 30–45.",
    unit: "days",
    safe: "under",
    warn: "over",
  },
  cei: {
    title: "Collecting what was due",
    explain: "Over the last 30 days: the share of what customers had to pay that actually came in.",
    unit: "%",
    safe: "more than",
    warn: "less than",
  },
  spend_jump: {
    title: "Spending jumps",
    explain:
      "A category is flagged when this month's spending in it is this much above its usual month (the average of the last 3).",
    unit: "% above usual",
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
          attention&rdquo;. A change applies from the next daily check; past checks keep their
          result.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-problem">Couldn&apos;t load the limits. Try again.</p>
      ) : null}
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
