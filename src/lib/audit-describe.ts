// Turns one audit_log row into plain words for the owner's audit screen (P6-T1).
// Pure: the page looks up names (categories, customers, people...) and passes them in.
import { formatRupiah } from "./money";

export type AuditRow = {
  action: "insert" | "update" | "delete" | string;
  table_name: string;
  record_id: string | null;
  old_value: unknown;
  new_value: unknown;
};

/** id → readable name, for every id that may appear (record ids and referenced ids). */
export type Names = Map<string, string>;

type Values = Record<string, unknown>;

// What each audited table is called, and which column names its record.
export const TABLES: Record<string, { label: string; plural: string; nameField?: string }> = {
  users: { label: "team member", plural: "Team members", nameField: "name" },
  bank_accounts: { label: "bank account", plural: "Bank accounts", nameField: "bank_name" },
  categories: { label: "category", plural: "Categories", nameField: "name" },
  rules: { label: "labelling rule", plural: "Labelling rules", nameField: "pattern" },
  entries: { label: "label on a transaction", plural: "Transaction labels" },
  // only money typed in by hand is audited here; what the bank sends is its own record
  bank_transactions: {
    label: "money entered by hand",
    plural: "Money entered by hand",
    nameField: "description_raw",
  },
  customers: { label: "customer", plural: "Customers", nameField: "name" },
  subscriptions: { label: "subscription", plural: "Subscriptions", nameField: "plan_name" },
  invoices: { label: "bill", plural: "Bills", nameField: "number" },
  payments: { label: "payment", plural: "Payments" },
  reminder_schedule: { label: "reminder step", plural: "Reminder steps", nameField: "kind" },
  // only the ones a person puts on the list ("Send a reminder now", alone or ticked together)
  reminders: { label: "reminder to send", plural: "Reminders sent by hand" },
  health_thresholds: { label: "health limit", plural: "Health limits", nameField: "signal" },
  recurring_expenses: { label: "regular cost", plural: "Regular costs", nameField: "name" },
  security_settings: { label: "sign-in setting", plural: "Sign-in settings" },
  parallel_run_weeks: {
    label: "parallel-run week from",
    plural: "Parallel run",
    nameField: "week_start",
  },
};

const FIELD: Record<string, string> = {
  name: "name",
  role: "role",
  bank_name: "bank",
  account_name: "account name",
  account_last4: "account number ending",
  source: "data comes from",
  is_active: "switched on",
  type: "money in or out",
  report_group: "report group",
  is_system: "built in",
  pattern: "words to look for",
  match_type: "how the words match",
  match_field: "where to look",
  direction: "direction",
  priority: "priority",
  category_id: "category",
  is_recurring: "repeats",
  note: "note",
  counterparty: "who",
  occurred_at: "when",
  amount: "amount",
  description_raw: "description",
  balance_after: "balance after",
  bank_account_id: "account",
  status: "status",
  customer_id: "customer",
  invoice_id: "bill",
  subscription_id: "subscription",
  billing_email: "billing email",
  whatsapp_number: "WhatsApp number",
  language: "language",
  notes: "notes",
  reminders_paused: "reminders paused",
  plan_name: "plan",
  price: "price",
  cycle: "billed every",
  start_date: "start date",
  end_date: "end date",
  next_invoice_date: "next bill date",
  number: "bill number",
  issued_on: "written on",
  due_on: "due date",
  base_amount: "amount",
  unique_code: "unique code",
  unique_amount: "amount with code",
  transfer_amount: "amount to transfer",
  amount_due: "still owed",
  void_reason: "reason for cancelling",
  voided_at: "cancelled on",
  amount_applied: "amount paid",
  method: "how it was paid",
  reason: "reason",
  bank_transaction_id: "bank transfer",
  offset_days: "days from the due date",
  kind: "step",
  channels: "sent by",
  template_key: "message",
  channel: "sent by",
  signal: "check",
  healthy_limit: "safe limit",
  warning_limit: "danger limit",
  expected_amount: "expected amount",
  frequency: "how often",
  day_of_month: "day of the month",
  source_pattern: "bank description",
  week_start: "week from",
  require_two_factor: "2-step sign-in required",
  their_came_in: "your came in",
  their_went_out: "your went out",
  their_cash: "your cash in bank",
  their_still_owed: "your still owed",
  app_came_in: "app came in",
  app_went_out: "app went out",
  app_cash: "app cash in bank",
  app_still_owed: "app still owed",
};

// Bookkeeping: who and when are on the line above, ids mean nothing to a person.
const HIDDEN = new Set([
  "id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "rule_id",
  "last_synced_at",
  "created_from_entry_id",
  "recorded_by",
  "recorded_at",
  "external_id",
  "entered_by",
  // worked out from the description by the database (P9-T7), never typed
  "payee",
  // a reminder's delivery bookkeeping: the list shows how it went
  "schedule_id",
  "scheduled_for",
  "provider_message_id",
  "amount_shown",
  "sent_at",
  "sent_by",
  "claimed_at",
  "error",
]);

const MONEY = new Set([
  "amount",
  "balance_after",
  "price",
  "base_amount",
  "unique_amount",
  "transfer_amount",
  "amount_due",
  "amount_applied",
  "expected_amount",
  "their_came_in",
  "their_went_out",
  "their_cash",
  "their_still_owed",
  "app_came_in",
  "app_went_out",
  "app_cash",
  "app_still_owed",
]);
const REFERENCE = new Set([
  "category_id",
  "customer_id",
  "invoice_id",
  "subscription_id",
  "bank_transaction_id",
  "bank_account_id",
]);
const DATE = new Set([
  "start_date",
  "end_date",
  "next_invoice_date",
  "issued_on",
  "due_on",
  "week_start",
]);
// Only these hold fixed codes; a customer called "open" must stay "open".
const CODED = new Set([
  "status",
  "method",
  "direction",
  "type",
  "cycle",
  "frequency",
  "source",
  "match_type",
  "kind",
  "channels",
  "signal",
  "language",
  "template_key",
  "channel",
]);

const WORDS: Record<string, string> = {
  // entries.status / invoices.status / subscriptions.status
  needs_label: "needs a label",
  auto: "automatic",
  labelled: "labelled by someone",
  open: "not paid yet",
  partly_paid: "partly paid",
  paid: "paid",
  void: "cancelled",
  active: "active",
  paused: "paused",
  ended: "ended",
  // payments.method
  manual: "matched by hand",
  no_transfer: "marked paid without a transfer",
  // reminders.status
  scheduled: "waiting to be sent",
  // directions, cycles, sources
  in: "money in",
  out: "money out",
  monthly: "month",
  quarterly: "3 months",
  yearly: "year",
  aggregator: "bank connection",
  csv: "statement upload",
  contains: "contains",
  equals: "is exactly",
  regex: "pattern",
  // reminder steps
  invoice: "the bill",
  reminder: "reminder",
  due_tomorrow: "due tomorrow",
  overdue: "late notice",
  escalate_team: "tell the team",
  // health checks
  runway: "how long the cash lasts",
  net_cashflow: "more coming in than going out",
  late_share: "getting paid on time",
  renewal_rate: "customers renewing",
  top_customer_share: "relying on one customer",
  forecast_low: "lowest point in the next 90 days",
  forecast_off: "how close the forecast was",
  overdue_share: "bills past their due date",
  over_90_share: "bills more than 90 days late",
  dso: "days customers take to pay",
  cei: "collecting what was due",
  spend_jump: "spending jumps",
  higher_is_better: "higher is better",
  lower_is_better: "lower is better",
  id: "Indonesian",
  en: "English",
};

const plainDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC", // a plain date has no time zone; don't let one shift it
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function showValue(field: string, value: unknown, names: Names): string {
  if (value === null || value === undefined || value === "") return "nothing";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (MONEY.has(field) && (typeof value === "number" || typeof value === "string")) {
    // to_jsonb writes bigint as a JSON number; rupiah stay far below 2^53, so this is exact.
    return formatRupiah(BigInt(value));
  }
  if (REFERENCE.has(field)) return names.get(String(value)) ?? "one that was removed";
  if (DATE.has(field) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return plainDay.format(new Date(`${value}T00:00:00Z`));
  }
  const word = (v: unknown) => (CODED.has(field) ? (WORDS[String(v)] ?? String(v)) : String(v));
  if (Array.isArray(value)) return value.map(word).join(" and ");
  return word(value);
}

const asValues = (v: unknown): Values => (v && typeof v === "object" ? (v as Values) : {});
const fieldName = (f: string) => FIELD[f] ?? f.replaceAll("_", " ");

/** "Changed bill INV-0001" + one line per field ("Changed status from not paid yet to paid"). */
export function describeAudit(row: AuditRow, names: Names): { title: string; changes: string[] } {
  const oldV = asValues(row.old_value);
  const newV = asValues(row.new_value);
  const table = TABLES[row.table_name] ?? {
    label: row.table_name.replaceAll("_", " "),
    plural: "",
  };

  // health_thresholds is keyed by its name (signal), so the record id is the name.
  const fromRow = table.nameField
    ? (newV[table.nameField] ??
      oldV[table.nameField] ??
      (row.table_name === "health_thresholds" ? row.record_id : undefined))
    : undefined;
  const name =
    (row.record_id ? names.get(row.record_id) : undefined) ??
    (fromRow != null ? showValue(table.nameField!, fromRow, names) : undefined);
  const thing = name ? `${table.label} ${name}` : `a ${table.label}`;

  if (row.action === "update") {
    const changes = Object.keys(newV)
      .filter((f) => !HIDDEN.has(f))
      .map(
        (f) =>
          `Changed ${fieldName(f)} from ${showValue(f, oldV[f], names)} to ${showValue(f, newV[f], names)}`,
      );
    return { title: `Changed ${thing}`, changes };
  }

  const values = row.action === "insert" ? newV : oldV;
  const changes = Object.entries(values)
    .filter(([f, v]) => !HIDDEN.has(f) && v !== null && v !== "" && f !== table.nameField)
    .map(([f, v]) => `${capitalise(fieldName(f))}: ${showValue(f, v, names)}`);
  if (row.table_name === "payments" && row.action === "insert") {
    const amount = showValue("amount_applied", newV.amount_applied, names);
    const bill = showValue("invoice_id", newV.invoice_id, names);
    return { title: `Recorded a payment of ${amount} on bill ${bill}`, changes };
  }
  if (row.table_name === "reminders" && row.action === "insert") {
    const bill = showValue("invoice_id", newV.invoice_id, names);
    const what = showValue("template_key", newV.template_key, names);
    return {
      title: `Put a ${what} for bill ${bill} on the list to send`,
      changes: changes.filter((c) => !c.startsWith("Bill:") && !c.startsWith("Message:")),
    };
  }
  return { title: `${row.action === "insert" ? "Added" : "Removed"} ${thing}`, changes };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** True when the screen has words for this column (or hides it on purpose). */
export const isReadableField = (field: string) => field in FIELD || HIDDEN.has(field);
