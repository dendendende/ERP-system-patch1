import { describe, expect, it } from "vitest";
import { formatRupiah } from "./money";
import {
  activeChips,
  moneyHref,
  moneyListArgs,
  monthRange,
  readMoneyFilters,
  viewQuery,
} from "./money-filters";

const CAT = "8a4bfaf2-ea71-416f-bcdf-a92df6117cbe";

describe("money list filters", () => {
  it("reads what makes sense and ignores the rest", () => {
    const f = readMoneyFilters({
      from: "2026-09-01",
      to: "not a date",
      dir: "in",
      category: CAT,
      account: "123",
      status: "matched",
      min: "1.500.000",
      max: "12,5",
      q: "  BIAYA ADM ",
      sort: "amount_desc",
      page: "3",
      vs: "year",
    });
    expect(f).toEqual({
      from: "2026-09-01",
      to: "",
      dir: "in",
      category: CAT,
      status: "matched",
      account: "",
      min: "1500000",
      max: "",
      q: "BIAYA ADM",
      sort: "amount_desc",
      page: 3,
      vs: "year",
    });
  });

  it("old ?show= links still work", () => {
    expect(readMoneyFilters({ show: "out" }).dir).toBe("out");
    expect(readMoneyFilters({ show: "matched" }).status).toBe("matched");
  });

  it("defaults: newest first, page 1, nothing filtered", () => {
    const f = readMoneyFilters({});
    expect(f.sort).toBe("date_desc");
    expect(f.page).toBe(1);
    expect(moneyHref(f)).toBe("/money?all=1");
    expect(moneyListArgs(f)).toEqual(
      Object.fromEntries(Object.keys(moneyListArgs(f)).map((k) => [k, undefined])),
    );
  });

  it("changing a filter goes back to page 1; paging keeps the filters", () => {
    const f = readMoneyFilters({ dir: "out", page: "4" });
    expect(moneyHref(f, { q: "AWS" })).toBe("/money?dir=out&q=AWS");
    expect(moneyHref(f, { page: 5 })).toBe("/money?dir=out&page=5");
  });

  it("rupiah stay exact as strings for the database", () => {
    const f = readMoneyFilters({ min: "9.007.199.254.740.993" });
    expect(moneyListArgs(f).p_min).toBe("9007199254740993");
  });

  it("a saved view stores only the filters (never the page)", () => {
    expect(viewQuery(readMoneyFilters({ dir: "out", q: "PT MAJU*", page: "3" }))).toBe(
      "dir=out&q=PT+MAJU*",
    );
    expect(viewQuery(readMoneyFilters({}))).toBe("");
  });

  it("a month becomes its first and last day", () => {
    expect(monthRange("2026-02-01")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12-01")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("each active filter is a chip that removes only itself", () => {
    const f = readMoneyFilters({ dir: "in", category: CAT, min: "1000" });
    const chips = activeChips(
      f,
      { categories: new Map([[CAT, "Other income"]]), accounts: new Map() },
      formatRupiah,
    );
    expect(chips.map((c) => c.label)).toEqual([
      "Money in",
      "Other income",
      expect.stringMatching(/^At least Rp\s?1\.000$/),
    ]);
    expect(chips[0].href).toBe(`/money?category=${CAT}&min=1000`);
  });
});
