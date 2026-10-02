// Cash forecast: day by day for the next 90 days, from today's bank balance.
// Pure and deterministic: the same input always gives the same answer, so it can be checked by hand.

/** What the forecast assumes. Shown on the forecast screen, word for word. */
export const ASSUMPTIONS = [
  "Starts from the money in the bank today.",
  "Bills already sent come in on their due date, moved later by however many days that customer is usually late.",
  "A bill that should already have come in is expected tomorrow.",
  "Customers who have never paid a bill yet are expected to pay on time.",
  "Subscriptions keep renewing at today's price until they end.",
  "Regular costs go out on their usual day; in a short month, on its last day.",
  "Nothing else comes in or goes out.",
] as const;

export type Bill = { label: string; owed: bigint; dueOn: string; customerDelayDays: number };
export type Subscription = {
  label: string;
  price: bigint;
  cycle: "monthly" | "quarterly" | "yearly";
  nextDueOn: string; // the next bill not written yet is due on this day
  endDate: string | null;
  customerDelayDays: number;
};
export type Cost = {
  label: string;
  amount: bigint;
  frequency: "monthly" | "quarterly" | "yearly";
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
};
export type Move = { date: string; amount: bigint; label: string; direction: "in" | "out" };

export type Forecast = {
  /** the bank balance it started from (today) */
  start: bigint;
  days: { date: string; balance: bigint }[];
  lowest: { date: string; balance: bigint };
  /** the biggest money going out in the week up to the lowest point */
  lowestAfter: Move | null;
  moves: Move[];
};

// Dates are plain YYYY-MM-DD calendar days (Jakarta), handled as UTC midnights.
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
};
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;

/** Day `day` of the month `months` after `from`'s month, clamped to that month's last day. */
function dayInMonth(from: string, months: number, day: number) {
  const d = toDate(from);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m, Math.min(day, last))));
}

export function forecast({
  today,
  balance,
  bills,
  subscriptions,
  costs,
  days = 90,
}: {
  today: string;
  balance: bigint;
  bills: Bill[];
  subscriptions: Subscription[];
  costs: Cost[];
  days?: number;
}): Forecast {
  const end = addDays(today, days);
  const inRange = (d: string) => d > today && d <= end;
  const moves: Move[] = [];

  for (const b of bills) {
    let date = addDays(b.dueOn, Math.max(0, Math.round(b.customerDelayDays)));
    if (date <= today) date = addDays(today, 1); // late already: expected tomorrow
    if (inRange(date) && b.owed > 0n) moves.push({ date, amount: b.owed, label: b.label, direction: "in" });
  }

  for (const s of subscriptions) {
    const due = s.nextDueOn;
    const day = toDate(due).getUTCDate();
    for (let i = 0; ; i++) {
      const dueOn = dayInMonth(due, i * MONTHS[s.cycle], day);
      if (dueOn > end || (s.endDate && dueOn > s.endDate)) break;
      const date = addDays(dueOn, Math.max(0, Math.round(s.customerDelayDays)));
      if (inRange(date)) moves.push({ date, amount: s.price, label: s.label, direction: "in" });
    }
  }

  for (const c of costs) {
    for (let i = 0; ; i++) {
      const date = dayInMonth(c.startDate, i * MONTHS[c.frequency], c.dayOfMonth);
      if (date > end || (c.endDate && date > c.endDate)) break;
      if (date >= c.startDate && inRange(date))
        moves.push({ date, amount: c.amount, label: c.label, direction: "out" });
    }
  }

  moves.sort((a, b) => a.date.localeCompare(b.date) || (a.direction === "out" ? -1 : 1));

  const daily: Forecast["days"] = [];
  let running = balance;
  let lowest = { date: today, balance };
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    for (const m of moves) if (m.date === date) running += m.direction === "in" ? m.amount : -m.amount;
    daily.push({ date, balance: running });
    if (running < lowest.balance) lowest = { date, balance: running };
  }

  const weekBefore = addDays(lowest.date, -7);
  const lowestAfter =
    moves
      .filter((m) => m.direction === "out" && m.date > weekBefore && m.date <= lowest.date)
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))[0] ?? null;

  return { start: balance, days: daily, lowest, lowestAfter, moves };
}

const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const when = (d: string) => short.format(toDate(d));

/** "In 60 days you'll have about Rp X. Lowest point is …, after …" — plus a warning if it runs out. */
export function forecastHeadline(f: Forecast, today: string, money: (v: bigint) => string) {
  const in60 = f.days[59] ?? f.days.at(-1);
  const first = in60 ? `In 60 days you'll have about ${money(in60.balance)}.` : "";
  const low =
    f.lowest.date === today
      ? " It never drops below what's in the bank today."
      : ` Lowest point is ${when(f.lowest.date)}, about ${money(f.lowest.balance)}${
          f.lowestAfter ? `, after ${f.lowestAfter.label}` : ""
        }.`;
  const out = f.days.find((d) => d.balance < 0n);
  return {
    headline: first + low,
    warning: out ? `At this rate the money runs out around ${when(out.date)}.` : null,
  };
}
