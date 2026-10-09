// The cues Home can show (P8-T6, UPGRADE-v2 §3.1): which exist, which each role starts with, and
// how a person's own arrangement (order, hidden) is applied. The numbers live in lib/metrics.ts.
import { type Role, canAccess } from "./auth/routes";

type CueInfo = {
  label: string;
  /** rupiah tiles are wide */
  wide?: boolean;
  /** a page the cue opens that not every role may: without it, the cue isn't offered */
  needs?: string;
};

export const CUES = {
  // money
  cash: { label: "Cash in the bank", wide: true },
  forecast_low: { label: "Lowest point, next 90 days", wide: true, needs: "/forecast" },
  net_cashflow: { label: "Left over this month", wide: true },
  runway: { label: "Cash lasts" },
  came_in: { label: "Came in this month", wide: true },
  went_out: { label: "Went out this month", wide: true },
  spend_jumps: { label: "Costs above usual" },
  forecast_off: { label: "Forecast was off by", needs: "/forecast" },
  // customers
  outstanding: { label: "Still owed to you", wide: true },
  overdue_share: { label: "Owed that is past due" },
  over_90_share: { label: "Owed over 90 days late" },
  dso: { label: "Days to get paid" },
  cei: { label: "Collected of what was due" },
  mrr: { label: "Subscriptions a month", wide: true },
  renewal_rate: { label: "Customers who renew" },
  renewals_due: { label: "Renewing in 30 days" },
  top_customer_share: { label: "Biggest customer's share" },
  // daily work
  needs_label: { label: "Need a label" },
  money_in_unmatched: { label: "Money in not matched" },
  late_customers: { label: "Paying late" },
  reminders_to_send: { label: "Reminders to send" },
  failed_messages: { label: "Messages not delivered" },
  marked_paid: { label: "Marked paid by hand", needs: "/settings/weekly-summary" },
  mismatches: { label: "Balances that don't add up" },
} satisfies Record<string, CueInfo>;

export type CueId = keyof typeof CUES;
export const CUE_IDS = Object.keys(CUES) as CueId[];
export const cueInfo = (id: CueId): CueInfo => CUES[id];

/** What each role sees first, in rows of four (a wide tile takes two). The viewer gets the
 * owner's view, minus what it can't open. */
const OWNER: CueId[] = [
  "cash",
  "forecast_low",
  "net_cashflow",
  "runway",
  "overdue_share",
  "outstanding",
  "mrr",
  "renewal_rate",
  "top_customer_share",
  "spend_jumps",
  "marked_paid",
  "mismatches",
];
const DEFAULTS: Record<Role, CueId[]> = {
  owner: OWNER,
  viewer: OWNER,
  operator: [
    "needs_label",
    "money_in_unmatched",
    "reminders_to_send",
    "failed_messages",
    "late_customers",
    "mismatches",
    "outstanding",
    "came_in",
    "went_out",
  ],
};

/** The cues this role may have on Home. */
export const available = (role: Role): CueId[] =>
  CUE_IDS.filter((id) => {
    const needs = cueInfo(id).needs;
    return !needs || canAccess(role, needs);
  });

/**
 * The cues shown, in order, and the ones hidden. `saved` is the person's own list of shown cues
 * (null = never arranged: the role's defaults). Unknown or no-longer-allowed ids are dropped.
 */
export function arrange(role: Role, saved: string[] | null) {
  const allowed = available(role);
  const shown = (saved ?? DEFAULTS[role]).filter(
    (id, i, all): id is CueId => allowed.includes(id as CueId) && all.indexOf(id) === i,
  );
  return { shown, hidden: allowed.filter((id) => !shown.includes(id)) };
}

/** One step of arranging: "up:cash", "down:cash", "hide:cash" or "show:cash" (added last). */
export function rearrange(shown: CueId[], step: string): CueId[] {
  const [verb, id] = step.split(":") as [string, CueId];
  const at = shown.indexOf(id);
  if (verb === "show") return at === -1 && id in CUES ? [...shown, id] : shown;
  if (at === -1) return shown;
  if (verb === "hide") return shown.filter((x) => x !== id);
  const to = verb === "up" ? at - 1 : verb === "down" ? at + 1 : -1;
  if (to < 0 || to >= shown.length) return shown;
  const next = [...shown];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
