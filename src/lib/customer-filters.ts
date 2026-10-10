// Customers list filters (P8-T8c), in the address bar like the other lists'.

export const CUSTOMER_SHOWS = ["late", "renewing", "active", "ended"] as const;

export const CUSTOMER_SHOW_WORDS: Record<(typeof CUSTOMER_SHOWS)[number], string> = {
  late: "Late",
  renewing: "Renewing soon",
  active: "Active",
  ended: "Ended",
};

export type CustomerFilters = { show: (typeof CUSTOMER_SHOWS)[number] | ""; q: string };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

export function readCustomerFilters(params: Params): CustomerFilters {
  const show = one(params.show);
  return {
    show: (CUSTOMER_SHOWS as readonly string[]).includes(show)
      ? (show as CustomerFilters["show"])
      : "",
    q: one(params.q).slice(0, 100),
  };
}

/** The filters as the part after "?": what a saved view stores. */
export function customerViewQuery(f: CustomerFilters) {
  const query = new URLSearchParams();
  if (f.show) query.set("show", f.show);
  if (f.q) query.set("q", f.q);
  return query.toString();
}

/** Link to the list with some filters changed; nothing filtered is ?all=1 (not the starting view). */
export const customerHref = (f: CustomerFilters, changes: Partial<CustomerFilters> = {}) =>
  `/customers?${customerViewQuery({ ...f, ...changes }) || "all=1"}`;
