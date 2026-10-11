// The ready-made reports (P9-T2, UPGRADE-v2 §5.7). Each one: its parameters, who may run it, and
// run() — sums in the database with the person's own rights (RLS), the arranging here.
// The framework (parameters, showing, exporting) is in reports.ts.
import { describeAudit } from "./audit-describe";
import { auditNames } from "./audit-names";
import { addDays } from "./forecast";
import { AGING_BUCKETS, monthEnd, ranked, ratio1, shiftMonth } from "./metrics";
import type { Cell, ReportDef, ReportResult } from "./reports";

type Client = Parameters<ReportDef["run"]>[0];

const big = (v: unknown) => BigInt(String(v ?? "0"));
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const byAmount = (a: bigint, b: bigint) => (b > a ? 1 : b < a ? -1 : 0);

function failed(what: string, error: { message: string } | null) {
  // a failed read must never look like an empty report
  if (error) throw new Error(`Couldn't run ${what}: ${error.message}`);
}

const jakartaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const monthLabel = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

// ---- cashflow statement (under review) --------------------------------------------------------

/**
 * The months a statement covers, as YYYY-MM-01: from `from` to `to` (either order), never past
 * this month, at most the 12 ending with the last.
 */
export function statementMonths(from: string, to: string, today: string) {
  let [first, last] = from <= to ? [from, to] : [to, from];
  const thisMonth = today.slice(0, 7);
  if (last > thisMonth) last = thisMonth;
  if (first > last) first = last;
  const earliest = shiftMonth(`${last}-01`, -11).slice(0, 7);
  if (first < earliest) first = earliest;
  const months: string[] = [];
  for (let m = `${first}-01`; m <= `${last}-01`; m = shiftMonth(m, 1)) months.push(m);
  return months;
}

/**
 * For each month: cash at the start + came in − went out = cash at the end + "not explained".
 * Cash = the bank balances summed over active accounts (money_summary, as on Home), on the day
 * before the month starts and on its last day (today, for this month). Came in / went out = the
 * transactions every total counts (cashflow_by_month): active accounts, own transfers and
 * cancelled hand entries left out. "Not explained" is whatever the balances moved by that the
 * transactions don't show — shown, never hidden, so the statement always adds up.
 */
export async function cashflowStatement(
  db: Client,
  months: string[],
  today: string,
): Promise<ReportResult> {
  const endOf = (m: string) => (monthEnd(m) < today ? monthEnd(m) : today);
  const first = months[0];
  const last = months[months.length - 1];
  const days = [...new Set(months.flatMap((m) => [addDays(m, -1), endOf(m)]))];
  const [flows, ...balances] = await Promise.all([
    db
      .rpc("cashflow_by_month", { p_from: first, p_to: endOf(last) })
      .select("month, direction, category_id, category, total::text"),
    ...days.map((d) =>
      db
        .rpc("money_summary", { p_today: d })
        .select("cash_in_bank::text, accounts_without_balance")
        .single(),
    ),
  ]);
  failed("the cashflow statement", flows.error);
  balances.forEach((b) => failed("the bank balances", b.error));
  const cashOn = new Map(days.map((d, i) => [d, big(balances[i].data?.cash_in_bank)]));
  const missing = Math.max(0, ...balances.map((b) => b.data?.accounts_without_balance ?? 0));

  const rows = flows.data ?? [];
  const key = (m: string) => `m${m.slice(0, 7)}`;
  const moved = (dir: string, m?: string, category?: string | null) =>
    sum(
      rows
        .filter(
          (r) =>
            r.direction === dir &&
            (m === undefined || r.month === m) &&
            (category === undefined || r.category_id === category),
        )
        .map((r) => big(r.total)),
    );
  // one amount per month, and the whole period's
  const line = (label: string, per: (m: string) => bigint, all: bigint): Record<string, Cell> => ({
    line: label,
    ...Object.fromEntries(months.map((m) => [key(m), per(m)])),
    total: all,
  });
  const range = `from=${first}&to=${endOf(last)}`;
  const categories = (dir: "in" | "out") => {
    const names = new Map<string | null, string>();
    for (const r of rows)
      if (r.direction === dir) names.set(r.category_id, r.category ?? "Needs a label");
    return [...names]
      .map(([id, name]) => ({ id, name, all: moved(dir, undefined, id) }))
      .sort((a, b) => byAmount(a.all, b.all) || a.name.localeCompare(b.name))
      .map((c) => ({
        cells: line(c.name, (m) => moved(dir, m, c.id), c.all),
        // the transactions behind the line
        href: `/money?dir=${dir}&${c.id ? `category=${c.id}` : "status=needs_label"}&${range}`,
      }));
  };

  const start = (m: string) => cashOn.get(addDays(m, -1))!;
  const end = (m: string) => cashOn.get(endOf(m))!;
  const net = (m: string) => moved("in", m) - moved("out", m);
  const allNet = moved("in") - moved("out");
  return {
    columns: [
      { key: "line", label: "", kind: "text" },
      ...months.map((m) => ({
        key: key(m),
        label: monthLabel.format(new Date(`${m}T00:00:00Z`)),
        kind: "rupiah" as const,
      })),
      { key: "total", label: months.length > 1 ? "All months" : "Total", kind: "rupiah" },
    ],
    rows: [
      { cells: line("Cash in the bank at the start", start, start(first)), strong: true },
      ...categories("in"),
      { cells: line("Came in", (m) => moved("in", m), moved("in")), strong: true },
      ...categories("out"),
      { cells: line("Went out", (m) => moved("out", m), moved("out")), strong: true },
      { cells: line("Left over (came in − went out)", net, allNet), strong: true },
      { cells: line("Cash in the bank at the end", end, end(last)), strong: true },
      {
        cells: line(
          "Not explained by the transactions",
          (m) => end(m) - start(m) - net(m),
          end(last) - start(first) - allNet,
        ),
        strong: true,
      },
    ],
    notes: [
      "Cash in the bank is every active account's balance as the bank last reported it: on the day before a month starts, and on its last day (today, for this month).",
      "Came in and went out are the same transactions every total in the app counts: money moved between your own accounts and hand entries cancelled as mistakes are left out.",
      "Not explained is what the balances moved by that the transactions don't show — for example money in an account the app doesn't follow, or a hand entry the bank hasn't sent. Ideally it is Rp 0.",
      ...(missing
        ? [
            `${missing} active ${missing === 1 ? "account doesn't" : "accounts don't"} report a balance, so cash in the bank leaves ${missing === 1 ? "it" : "them"} out.`,
          ]
        : []),
    ],
  };
}

// ---- AR aging detail (under review) -----------------------------------------------------------

/**
 * Every bill still owed at the end of a day, its amount in the column of how late it was.
 * bill_list's "owed" is invoice_owed_on(day), so the column totals are receivables_summary(day)'s
 * aging — the same numbers as Home and the bills list.
 */
export async function agingDetail(db: Client, on: string): Promise<ReportResult> {
  const { data, error } = await db
    .rpc("bill_list", { p_on: on })
    .select("id, number, customer, due_on, days_late, bucket, owed::text")
    .gt("owed", 0)
    .order("customer")
    .order("due_on")
    .order("number");
  failed("the aging detail", error);
  const rows = data ?? [];
  const bucket = (b: number) => sum(rows.filter((r) => r.bucket === b).map((r) => big(r.owed)));
  return {
    columns: [
      { key: "customer", label: "Customer", kind: "text" },
      { key: "number", label: "Bill", kind: "text" },
      { key: "due", label: "Due", kind: "day" },
      { key: "late", label: "Days late", kind: "number" },
      ...AGING_BUCKETS.map((label, b) => ({ key: `b${b}`, label, kind: "rupiah" as const })),
      { key: "owed", label: "Still owed", kind: "rupiah" },
    ],
    rows: rows.map((r) => ({
      cells: {
        customer: r.customer,
        number: r.number,
        due: r.due_on,
        late: r.days_late,
        ...Object.fromEntries(
          AGING_BUCKETS.map((_, b) => [`b${b}`, r.bucket === b ? big(r.owed) : null]),
        ),
        owed: big(r.owed),
      },
      href: `/customers/bills?open=${r.id}`,
    })),
    totals: {
      customer: "Total",
      ...Object.fromEntries(AGING_BUCKETS.map((_, b) => [`b${b}`, bucket(b)])),
      owed: sum(rows.map((r) => big(r.owed))),
    },
    notes: [
      "What each bill still owed at the end of the day chosen: the bill, less the payments that had reached the bank by then. The last digits of a unique transfer amount are never owed.",
      "Days late count from the day after the due date. The totals are the aging on Home and in the bills list for that day.",
    ],
  };
}

// ---- customer statement -----------------------------------------------------------------------

// The statement's words: English on screen; to send, in the customer's own language.
const STATEMENT_WORDS = {
  en: {
    columns: ["Date", "What", "Bill", "Billed", "Paid or cancelled", "Still owed"],
    start: "Owed at the start",
    end: "Owed at the end",
    kinds: {
      bill: "Bill",
      payment: "Payment",
      marked_paid: "Marked paid without a transfer",
      cancelled: "Bill cancelled",
    } as Record<string, string>,
    note: "Payments count on the day the money reached the bank, and only up to what the bill still owed: the last digits of a unique transfer amount are never owed.",
  },
  id: {
    columns: ["Tanggal", "Keterangan", "Tagihan", "Ditagih", "Dibayar/dibatalkan", "Sisa"],
    start: "Sisa di awal",
    end: "Sisa di akhir",
    kinds: {
      bill: "Tagihan",
      payment: "Pembayaran",
      marked_paid: "Lunas tanpa transfer",
      cancelled: "Tagihan dibatalkan",
    } as Record<string, string>,
    note: "Pembayaran dihitung pada hari dana masuk ke rekening kami, sebesar sisa tagihannya: angka unik di akhir jumlah transfer tidak pernah ditagihkan.",
  },
};

/** What one customer owes on a day (invoice_owed_on: the rules every receivables total uses). */
async function owedOn(db: Client, customer: string, day: string) {
  const { data, error } = await db
    .rpc("invoice_owed_on", { p_on: day })
    .select("owed::text")
    .eq("customer_id", customer);
  failed("what the customer owed", error);
  return sum((data ?? []).map((r) => big(r.owed)));
}

/**
 * A customer's statement: what they owed the day before, every bill, payment and cancellation
 * since, with the running balance — ending on what they owe at the end, to the rupiah (a line
 * says so if it ever doesn't). customer_statement() counts each payment only up to what its bill
 * still owed, like invoice_owed_on, so the two always agree.
 * With `forCustomer` it is the copy to send: in their language, and one that doesn't add up is
 * never made (it throws).
 */
export async function customerStatement(
  db: Client,
  customer: string,
  from: string,
  to: string,
  forCustomer?: "en" | "id",
): Promise<ReportResult> {
  const w = STATEMENT_WORDS[forCustomer ?? "en"];
  const kinds = ["day", "text", "text", "rupiah", "rupiah", "rupiah"] as const;
  const columns: ReportResult["columns"] = ["day", "what", "bill", "added", "paid", "owed"].map(
    (key, i) => ({ key, label: w.columns[i], kind: kinds[i] }),
  );
  if (!customer) return { columns, rows: [], notes: ["Choose a customer."] };
  const [first, last] = from <= to ? [from, to] : [to, from];
  const before = addDays(first, -1);
  const [opening, closing, lines] = await Promise.all([
    owedOn(db, customer, before),
    owedOn(db, customer, last),
    db
      .rpc("customer_statement", { p_customer: customer, p_from: first, p_to: last })
      .select("day, kind, invoice_id, number, amount::text"),
  ]);
  failed("the statement", lines.error);

  let owed = opening;
  const rows: ReportResult["rows"] = [
    {
      cells: { day: before, what: w.start, bill: null, added: null, paid: null, owed },
    },
    ...(lines.data ?? []).map((l) => {
      const amount = big(l.amount);
      owed += amount;
      return {
        cells: {
          day: l.day,
          what: w.kinds[l.kind] ?? l.kind,
          bill: l.number,
          added: amount > 0n ? amount : null,
          paid: amount < 0n ? -amount : null,
          owed,
        },
        href: `/customers/bills?open=${l.invoice_id}`,
      };
    }),
  ];
  const amounts = (lines.data ?? []).map((l) => big(l.amount));
  if (forCustomer && owed !== closing)
    throw new Error(`The statement doesn't add up (${owed} vs ${closing}); not sending it`);
  return {
    columns,
    rows,
    totals: {
      what: w.end,
      added: sum(amounts.filter((a) => a > 0n)),
      paid: -sum(amounts.filter((a) => a < 0n)),
      owed: closing,
    },
    notes: [
      w.note,
      ...(owed === closing
        ? []
        : [
            `These lines add up to ${owed}, but what the customer owes at the end is ${closing}. Tell the developer: this should never happen.`,
          ]),
    ],
  };
}

// ---- spend by category ------------------------------------------------------------------------

/** Money out by category over whole months, biggest first, with each one's share and its month. */
export async function spendByCategory(
  db: Client,
  months: string[],
  today: string,
): Promise<ReportResult> {
  const endOf = (m: string) => (monthEnd(m) < today ? monthEnd(m) : today);
  const first = months[0];
  const to = endOf(months[months.length - 1]);
  const { data, error } = await db
    .rpc("cashflow_by_month", { p_from: first, p_to: to })
    .select("direction, category_id, category, total::text");
  failed("spend by category", error);
  const byCategory = new Map<string | null, { name: string; total: bigint }>();
  for (const r of data ?? []) {
    if (r.direction !== "out") continue;
    const c = byCategory.get(r.category_id) ?? { name: r.category ?? "Needs a label", total: 0n };
    c.total += big(r.total);
    byCategory.set(r.category_id, c);
  }
  const rows = ranked(
    [...byCategory].map(([id, c]) => ({
      name: c.name,
      total: c.total,
      href: `/money?dir=out&${id ? `category=${id}` : "status=needs_label"}&from=${first}&to=${to}`,
    })),
  );
  const n = BigInt(months.length);
  return {
    columns: [
      { key: "category", label: "Category", kind: "text" },
      { key: "total", label: "Went out", kind: "rupiah" },
      { key: "share", label: "Share", kind: "percent" },
      { key: "month", label: "A month, on average", kind: "rupiah" },
    ],
    rows: rows.map((r) => ({
      cells: { category: r.name, total: r.total, share: r.share, month: (r.total + n / 2n) / n },
      href: r.href,
    })),
    totals: {
      category: "Total",
      total: sum(rows.map((r) => r.total)),
      share: null,
      month: (sum(rows.map((r) => r.total)) + n / 2n) / n,
    },
    notes: [
      `${months.length} ${months.length === 1 ? "month" : "months"}${months[months.length - 1].slice(0, 7) === today.slice(0, 7) ? ", this one so far" : ""}. Money moved between your own accounts and hand entries cancelled as mistakes are left out.`,
    ],
  };
}

// ---- reminder effectiveness -------------------------------------------------------------------

const MESSAGE_WORDS: Record<string, string> = {
  invoice: "The bill",
  reminder: "Reminder before the due date",
  due_tomorrow: "Due tomorrow",
  overdue: "Late notice",
};
const MESSAGE_ORDER = Object.keys(MESSAGE_WORDS);

/** For each kind of message sent between two days: how many, and how many bills were then paid
 * in full within 7 days (reminder_effectiveness). */
export async function reminderEffectiveness(
  db: Client,
  from: string,
  to: string,
): Promise<ReportResult> {
  const [first, last] = from <= to ? [from, to] : [to, from];
  const { data, error } = await db
    .rpc("reminder_effectiveness", { p_from: first, p_to: last })
    .select("kind, sent, paid_within_7, average_days");
  failed("reminder effectiveness", error);
  const rows = [...(data ?? [])].sort(
    (a, b) => (MESSAGE_ORDER.indexOf(a.kind) + 1 || 99) - (MESSAGE_ORDER.indexOf(b.kind) + 1 || 99),
  );
  const share = (paid: number, sent: number) =>
    sent ? ratio1(BigInt(paid) * 100n, BigInt(sent)) : null;
  const sent = rows.reduce((t, r) => t + r.sent, 0);
  const paid = rows.reduce((t, r) => t + r.paid_within_7, 0);
  return {
    columns: [
      { key: "kind", label: "Message", kind: "text" },
      { key: "sent", label: "Sent", kind: "number" },
      { key: "paid", label: "Paid within 7 days", kind: "number" },
      { key: "share", label: "Share paid", kind: "percent" },
      { key: "days", label: "Days to pay, on average", kind: "number" },
    ],
    rows: rows.map((r) => ({
      cells: {
        kind: MESSAGE_WORDS[r.kind] ?? r.kind,
        sent: r.sent,
        paid: r.paid_within_7,
        share: share(r.paid_within_7, r.sent),
        days: r.average_days === null ? null : Number(r.average_days),
      },
    })),
    totals: { kind: "All messages", sent, paid, share: share(paid, sent), days: null },
    notes: [
      "Messages that actually went out (by the app or by hand) between the two days. Thank-you messages are left out.",
      "Paid within 7 days: the bill is paid in full now, and its last payment reached the bank within 7 days after the message. A bill reminded twice counts under each message.",
    ],
  };
}

// ---- audit extract (owner) --------------------------------------------------------------------

const MAX_AUDIT_ROWS = 5000;
const auditWhen = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Every change in the change history between two days, oldest first, in words. */
export async function auditExtract(db: Client, from: string, to: string): Promise<ReportResult> {
  const [first, last] = from <= to ? [from, to] : [to, from];
  const { data, error } = await db
    .from("audit_log")
    .select("id, actor_id, action, table_name, record_id, old_value, new_value, reason, created_at")
    .gte("created_at", `${first}T00:00:00+07:00`)
    .lt("created_at", `${addDays(last, 1)}T00:00:00+07:00`)
    .order("id")
    .limit(MAX_AUDIT_ROWS + 1);
  failed("the audit extract", error);
  const rows = (data ?? []).slice(0, MAX_AUDIT_ROWS);
  const { names } = await auditNames(db, rows);
  return {
    columns: [
      { key: "when", label: "When", kind: "text" },
      { key: "who", label: "Who", kind: "text" },
      { key: "what", label: "What", kind: "text" },
      { key: "changes", label: "Changes", kind: "text" },
      { key: "reason", label: "Reason", kind: "text" },
    ],
    rows: rows.map((r) => {
      const d = describeAudit(r, names);
      return {
        cells: {
          when: auditWhen.format(new Date(r.created_at)),
          who: r.actor_id ? (names.get(r.actor_id) ?? "Someone who left the team") : "The app",
          what: d.title,
          changes: d.changes.join("; "),
          reason: r.reason,
        },
      };
    }),
    notes: [
      "Every change to money, customers, bills, settings and the team, with who made it and what it was before. Nothing in it can be edited or removed.",
      ...((data ?? []).length > MAX_AUDIT_ROWS
        ? [
            `Only the first ${MAX_AUDIT_ROWS.toLocaleString("id-ID")} changes are shown — choose fewer days for the rest.`,
          ]
        : []),
    ],
  };
}

// ---- the library ------------------------------------------------------------------------------

const thisMonth = (today: string) => today.slice(0, 7);

export const REPORTS: ReportDef[] = [
  {
    id: "cashflow",
    title: "Cashflow statement",
    description:
      "Month by month: cash at the start, what came in and went out by category, cash at the end.",
    params: [
      {
        key: "from",
        label: "From month",
        kind: "month",
        default: (t) => shiftMonth(`${thisMonth(t)}-01`, -5).slice(0, 7),
      },
      { key: "to", label: "To month", kind: "month", default: thisMonth },
    ],
    run: (db, { from, to }) => {
      const today = jakartaToday();
      return cashflowStatement(db, statementMonths(from, to, today), today);
    },
  },
  {
    id: "aging_detail",
    title: "What customers owe, by how late",
    description: "Every bill still owed at the end of a day, by customer, in its lateness column.",
    params: [{ key: "on", label: "On", kind: "day", default: (t) => t }],
    run: (db, { on }) => agingDetail(db, on),
  },
  {
    id: "customer_statement",
    title: "Customer statement",
    description:
      "One customer's bills, payments and cancellations between two days, with what they owe after each.",
    params: [
      { key: "customer", label: "Customer", kind: "customer", default: () => "" },
      {
        key: "from",
        label: "From",
        kind: "day",
        default: (t) => shiftMonth(`${thisMonth(t)}-01`, -2),
      },
      { key: "to", label: "To", kind: "day", default: (t) => t },
    ],
    run: (db, { customer, from, to }) => customerStatement(db, customer, from, to),
  },
  {
    id: "spend_by_category",
    title: "Spend by category",
    description: "Where the money went over whole months, biggest first, with a month on average.",
    params: [
      {
        key: "from",
        label: "From month",
        kind: "month",
        default: (t) => shiftMonth(`${thisMonth(t)}-01`, -2).slice(0, 7),
      },
      { key: "to", label: "To month", kind: "month", default: thisMonth },
    ],
    run: (db, { from, to }) => {
      const today = jakartaToday();
      return spendByCategory(db, statementMonths(from, to, today), today);
    },
  },
  {
    id: "revenue_by_customer",
    title: "Revenue by customer",
    description: "What each customer paid over the 12 months up to a day, biggest first.",
    params: [{ key: "on", label: "Up to", kind: "day", default: (today) => today }],
    async run(db, { on }) {
      const { data, error } = await db
        .rpc("revenue_by_customer", { p_on: on })
        .select("customer_id, customer, total::text");
      failed("revenue by customer", error);
      const rows = ranked(
        (data ?? []).map((c) => ({
          name: c.customer,
          total: big(c.total),
          href: `/customers?open=${c.customer_id}`,
        })),
      );
      return {
        columns: [
          { key: "customer", label: "Customer", kind: "text" },
          { key: "total", label: "Paid", kind: "rupiah" },
          { key: "share", label: "Share", kind: "percent" },
        ],
        rows: rows.map((r) => ({
          cells: { customer: r.name, total: r.total, share: r.share },
          href: r.href,
        })),
        totals: { customer: "Total", total: sum(rows.map((r) => r.total)), share: null },
        notes: [
          "Payments on bills, by the day the money reached the bank, in the 12 months up to the day chosen — the numbers behind the biggest customer's share on Home.",
          "Bills marked paid without a transfer are left out: that money never came through the bank.",
        ],
      };
    },
  },
  {
    id: "revenue_by_plan",
    title: "Revenue by plan",
    description: "What each plan brought in over the 12 months up to a day, biggest first.",
    params: [{ key: "on", label: "Up to", kind: "day", default: (today) => today }],
    async run(db, { on }) {
      const { data, error } = await db
        .rpc("revenue_by_plan", { p_on: on })
        .select("plan, total::text");
      failed("revenue by plan", error);
      const rows = ranked(
        (data ?? []).map((p) => ({ name: p.plan, total: big(p.total), href: "" })),
      );
      return {
        columns: [
          { key: "plan", label: "Plan", kind: "text" },
          { key: "total", label: "Came in", kind: "rupiah" },
          { key: "share", label: "Share", kind: "percent" },
        ],
        rows: rows.map((r) => ({ cells: { plan: r.name, total: r.total, share: r.share } })),
        totals: { plan: "Total", total: rows.reduce((t, r) => t + r.total, 0n), share: null },
        notes: [
          "Payments on bills, by the day the money reached the bank, in the 12 months up to the day chosen.",
          "Bills marked paid without a transfer are left out: that money never came through the bank.",
        ],
      };
    },
  },
  {
    id: "reminder_effectiveness",
    title: "Reminder effectiveness",
    description:
      "For each kind of message: how many went out, and how many bills were paid soon after.",
    params: [
      { key: "from", label: "From", kind: "day", default: (t) => addDays(t, -90) },
      { key: "to", label: "To", kind: "day", default: (t) => t },
    ],
    run: (db, { from, to }) => reminderEffectiveness(db, from, to),
  },
  {
    id: "audit_extract",
    title: "Change history extract",
    description:
      "Every change between two days — who, what, before and after — to keep or hand over.",
    params: [
      { key: "from", label: "From", kind: "day", default: (t) => `${thisMonth(t)}-01` },
      { key: "to", label: "To", kind: "day", default: (t) => t },
    ],
    // the change history is the owner's to read (RLS on audit_log says the same)
    roles: ["owner"],
    run: (db, { from, to }) => auditExtract(db, from, to),
  },
];

export const findReport = (id: string) => REPORTS.find((r) => r.id === id) ?? null;
