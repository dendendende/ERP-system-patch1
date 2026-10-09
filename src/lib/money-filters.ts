// Money in & out filters, kept in the address bar so every view has its own link (and the
// back button, bookmarks and "copy link" all work). Everything typed is checked here; anything
// that doesn't make sense is simply ignored.

export const PAGE_SIZE = 500;

export const DIRECTIONS = ["in", "out"] as const;
export const STATUSES = ["needs_label", "labelled", "matched", "recurring"] as const;
export const SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;

/** Column and direction for each sort; the list and its CSV file use the same one. */
export const SORT_COLUMN = {
  date_desc: ["occurred_at", false],
  date_asc: ["occurred_at", true],
  amount_desc: ["amount", false],
  amount_asc: ["amount", true],
} as const;

export type MoneyFilters = {
  from: string; // YYYY-MM-DD (Jakarta day) or ""
  to: string;
  dir: (typeof DIRECTIONS)[number] | "";
  category: string; // uuid or ""
  status: (typeof STATUSES)[number] | "";
  account: string; // uuid or ""
  min: string; // whole rupiah digits or ""
  max: string;
  q: string;
  sort: (typeof SORTS)[number];
  page: number;
};

export const STATUS_WORDS: Record<(typeof STATUSES)[number], string> = {
  needs_label: "Needs a label",
  labelled: "Labelled",
  matched: "Matched to a bill",
  recurring: "Regular cost",
};

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** "1.500.000" or "1500000" → "1500000"; anything else → "". */
const rupiah = (v: string) => {
  const digits = v.replace(/[.\s]/g, "");
  return /^\d{1,18}$/.test(digits) ? String(BigInt(digits)) : "";
};
const pick = <T extends string>(v: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(v) ? (v as T) : "";

export function readMoneyFilters(params: Params): MoneyFilters {
  // older links used ?show=in|out|matched
  const show = one(params.show);
  return {
    from: isDay(one(params.from)) ? one(params.from) : "",
    to: isDay(one(params.to)) ? one(params.to) : "",
    dir: pick(one(params.dir) || show, DIRECTIONS),
    category: isUuid(one(params.category)) ? one(params.category) : "",
    status: pick(one(params.status) || show, STATUSES),
    account: isUuid(one(params.account)) ? one(params.account) : "",
    min: rupiah(one(params.min)),
    max: rupiah(one(params.max)),
    q: one(params.q).slice(0, 100),
    sort: pick(one(params.sort), SORTS) || "date_desc",
    page: Math.max(1, Math.floor(Number(one(params.page))) || 1),
  };
}

/** Arguments for money_list / money_list_summary (rupiah as strings: exact above 2^53). */
export function moneyListArgs(f: MoneyFilters) {
  return {
    p_from: f.from || undefined,
    p_to: f.to || undefined,
    p_direction: f.dir || undefined,
    p_category: f.category || undefined,
    p_status: f.status || undefined,
    p_account: f.account || undefined,
    p_min: (f.min || undefined) as unknown as number | undefined,
    p_max: (f.max || undefined) as unknown as number | undefined,
    p_q: f.q || undefined,
  };
}

/** The filters as the part after "?" (no page): what a saved view stores. */
export function viewQuery(f: MoneyFilters) {
  return queryOf({ ...f, page: 1 });
}

/** Link to the list with some filters changed. Changing a filter goes back to page 1.
 * "Nothing filtered" is ?all=1, so it isn't mistaken for "open my starting view" (bare /money). */
export function moneyHref(f: MoneyFilters, changes: Partial<MoneyFilters> = {}, base = "/money") {
  const next = { ...f, ...("page" in changes ? {} : { page: 1 }), ...changes };
  return `${base}?${queryOf(next) || "all=1"}`;
}

function queryOf(next: MoneyFilters) {
  const query = new URLSearchParams();
  for (const key of [
    "from",
    "to",
    "dir",
    "category",
    "status",
    "account",
    "min",
    "max",
    "q",
  ] as const) {
    if (next[key]) query.set(key, next[key]);
  }
  if (next.sort !== "date_desc") query.set("sort", next.sort);
  if (next.page > 1) query.set("page", String(next.page));
  return query.toString();
}

/** A Jakarta month (YYYY-MM-01) as a from/to range, for clicking a month in the chart. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** The active filters as removable chips. */
export function activeChips(
  f: MoneyFilters,
  names: { categories: Map<string, string>; accounts: Map<string, string> },
  formatRupiah: (n: bigint) => string,
) {
  const chips: { label: string; href: string }[] = [];
  const add = (label: string, changes: Partial<MoneyFilters>) =>
    chips.push({ label, href: moneyHref(f, changes) });
  if (f.from && f.to) add(`${f.from} to ${f.to}`, { from: "", to: "" });
  else if (f.from) add(`From ${f.from}`, { from: "" });
  else if (f.to) add(`Until ${f.to}`, { to: "" });
  if (f.dir) add(f.dir === "in" ? "Money in" : "Money out", { dir: "" });
  if (f.category) add(names.categories.get(f.category) ?? "A category", { category: "" });
  if (f.status) add(STATUS_WORDS[f.status], { status: "" });
  if (f.account) add(names.accounts.get(f.account) ?? "An account", { account: "" });
  if (f.min) add(`At least ${formatRupiah(BigInt(f.min))}`, { min: "" });
  if (f.max) add(`At most ${formatRupiah(BigInt(f.max))}`, { max: "" });
  if (f.q) add(`"${f.q}"`, { q: "" });
  return chips;
}
