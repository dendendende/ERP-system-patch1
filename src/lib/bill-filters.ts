// Bills list filters (P8-T8a), kept in the address bar like Money in & out's (lib/money-filters):
// every view has its own link; anything typed that doesn't make sense is ignored.
import { AGING_BUCKETS } from "./metrics";
import { isUuid } from "./money-filters";

export const PAGE_SIZE = 500;

export const BILL_STATUSES = ["waiting", "late", "late_30", "paid", "void"] as const;
export const BILL_SORTS = ["due_desc", "due_asc", "owed_desc", "owed_asc"] as const;

export const BILL_STATUS_WORDS: Record<(typeof BILL_STATUSES)[number], string> = {
  waiting: "Still owed",
  late: "Late",
  late_30: "More than 30 days late",
  paid: "Paid",
  void: "Cancelled",
};

/** Column and direction for each sort; the list and its CSV use the same one. */
export const BILL_SORT_COLUMN = {
  due_desc: ["due_on", false],
  due_asc: ["due_on", true],
  owed_desc: ["owed", false],
  owed_asc: ["owed", true],
} as const;

export type BillFilters = {
  status: (typeof BILL_STATUSES)[number] | "";
  /** aging bucket "0"–"4", or "" */
  bucket: string;
  customer: string; // uuid or ""
  from: string; // due from, YYYY-MM-DD or ""
  to: string;
  q: string;
  sort: (typeof BILL_SORTS)[number];
  page: number;
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const pick = <T extends string>(v: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(v) ? (v as T) : "";

export function readBillFilters(params: Params): BillFilters {
  return {
    status: pick(one(params.status), BILL_STATUSES),
    bucket: /^[0-4]$/.test(one(params.bucket)) ? one(params.bucket) : "",
    customer: isUuid(one(params.customer)) ? one(params.customer) : "",
    from: isDay(one(params.from)) ? one(params.from) : "",
    to: isDay(one(params.to)) ? one(params.to) : "",
    q: one(params.q).slice(0, 100),
    sort: pick(one(params.sort), BILL_SORTS) || "due_desc",
    page: Math.max(1, Math.floor(Number(one(params.page))) || 1),
  };
}

/** Arguments for bill_list / bill_list_summary. */
export function billListArgs(f: BillFilters) {
  return {
    p_status: f.status || undefined,
    p_bucket: f.bucket ? Number(f.bucket) : undefined,
    p_customer: f.customer || undefined,
    p_from: f.from || undefined,
    p_to: f.to || undefined,
    p_q: f.q || undefined,
  };
}

function queryOf(next: BillFilters) {
  const query = new URLSearchParams();
  for (const key of ["status", "bucket", "customer", "from", "to", "q"] as const) {
    if (next[key]) query.set(key, next[key]);
  }
  if (next.sort !== "due_desc") query.set("sort", next.sort);
  if (next.page > 1) query.set("page", String(next.page));
  return query.toString();
}

/** The filters as the part after "?" (no page): what a saved view stores. */
export const billViewQuery = (f: BillFilters) => queryOf({ ...f, page: 1 });

/** Link to the list with some filters changed (back to page 1 unless the page is the change).
 * "Nothing filtered" is ?all=1, so it isn't taken for "open my starting view". */
export function billHref(
  f: BillFilters,
  changes: Partial<BillFilters> = {},
  base = "/customers/bills",
) {
  const next = { ...f, ...("page" in changes ? {} : { page: 1 }), ...changes };
  return `${base}?${queryOf(next) || "all=1"}`;
}

/** A link to the bills list with just these filters (for cues and charts elsewhere). */
export const billsWhere = (changes: Partial<BillFilters>) => billHref(readBillFilters({}), changes);

/** The active filters as removable chips. */
export function billChips(f: BillFilters, customerName: string | null) {
  const chips: { label: string; href: string }[] = [];
  const add = (label: string, changes: Partial<BillFilters>) =>
    chips.push({ label, href: billHref(f, changes) });
  if (f.status) add(BILL_STATUS_WORDS[f.status], { status: "" });
  if (f.bucket) add(AGING_BUCKETS[Number(f.bucket)], { bucket: "" });
  if (f.customer) add(customerName ?? "A customer", { customer: "" });
  if (f.from && f.to) add(`Due ${f.from} to ${f.to}`, { from: "", to: "" });
  else if (f.from) add(`Due from ${f.from}`, { from: "" });
  else if (f.to) add(`Due until ${f.to}`, { to: "" });
  if (f.q) add(`"${f.q}"`, { q: "" });
  return chips;
}
