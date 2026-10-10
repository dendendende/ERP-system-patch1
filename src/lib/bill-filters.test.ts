import { describe, expect, it } from "vitest";
import { billChips, billHref, billListArgs, billsWhere, readBillFilters } from "./bill-filters";

const C = "aa61445e-beab-4d86-8002-b7f92afc8dd2";

describe("bill filters", () => {
  it("keeps what makes sense and ignores the rest", () => {
    const f = readBillFilters({
      status: "late",
      bucket: "5",
      customer: "x'; drop",
      from: "2026-13-40",
      to: "2026-10-31",
      sort: "owed_desc",
      page: "-3",
    });
    expect(f).toMatchObject({
      status: "late",
      bucket: "",
      customer: "",
      from: "",
      to: "2026-10-31",
    });
    expect(f.sort).toBe("owed_desc");
    expect(f.page).toBe(1);
    expect(readBillFilters({ status: "nope", bucket: "4" })).toMatchObject({
      status: "",
      bucket: "4",
    });
  });

  it("turns into the database's arguments", () => {
    expect(billListArgs(readBillFilters({ bucket: "0", customer: C }))).toEqual({
      p_status: undefined,
      p_bucket: 0, // bucket 0 is a real filter, not "none"
      p_customer: C,
      p_from: undefined,
      p_to: undefined,
      p_q: undefined,
    });
  });

  it("links: a change goes back to page 1; nothing filtered is ?all=1", () => {
    const f = readBillFilters({ status: "late", page: "3" });
    expect(billHref(f, { bucket: "2" })).toBe("/customers/bills?status=late&bucket=2");
    expect(billHref(f, { page: 2 })).toBe("/customers/bills?status=late&page=2");
    expect(billHref(f, { status: "" })).toBe("/customers/bills?all=1");
    expect(billsWhere({ customer: C })).toBe(`/customers/bills?customer=${C}`);
  });

  it("chips name each filter and remove only it", () => {
    const f = readBillFilters({ status: "waiting", bucket: "4", customer: C });
    expect(billChips(f, "PT Maju")).toEqual([
      { label: "Still owed", href: `/customers/bills?bucket=4&customer=${C}` },
      { label: "Over 90 days late", href: `/customers/bills?status=waiting&customer=${C}` },
      { label: "PT Maju", href: "/customers/bills?status=waiting&bucket=4" },
    ]);
  });
});
