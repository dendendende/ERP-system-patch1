import { describe, expect, it } from "vitest";
import { describeAudit } from "./audit-describe";

const names = new Map([
  ["cat-other", "Other"],
  ["cat-soft", "Software"],
  ["inv-1", "INV-0001"],
  ["entry-1", "TRF PT MAJU"],
]);

describe("describeAudit", () => {
  it("says a label change in plain words", () => {
    const d = describeAudit(
      {
        action: "update",
        table_name: "entries",
        record_id: "entry-1",
        old_value: { category_id: "cat-other", status: "needs_label", updated_at: "x" },
        new_value: { category_id: "cat-soft", status: "labelled", updated_at: "y" },
      },
      names,
    );
    expect(d.title).toBe("Changed label on a transaction TRF PT MAJU");
    expect(d.changes).toEqual([
      "Changed category from Other to Software",
      "Changed status from needs a label to labelled by someone",
    ]);
  });

  it("formats money, dates and codes", () => {
    const d = describeAudit(
      {
        action: "update",
        table_name: "invoices",
        record_id: "inv-1",
        old_value: { status: "open", amount_due: 1500123, due_on: "2026-10-01" },
        new_value: { status: "paid", amount_due: 0, due_on: "2026-10-08" },
      },
      names,
    );
    expect(d.title).toBe("Changed bill INV-0001");
    expect(d.changes).toEqual([
      "Changed status from not paid yet to paid",
      expect.stringMatching(/^Changed still owed from Rp\s?1\.500\.123 to Rp\s?0$/),
      "Changed due date from 1 Oct 2026 to 8 Oct 2026",
    ]);
  });

  it("does not translate free text that happens to look like a code", () => {
    const d = describeAudit(
      {
        action: "insert",
        table_name: "customers",
        record_id: "c1",
        old_value: null,
        new_value: { id: "c1", name: "open", notes: "paid", language: "en" },
      },
      new Map(),
    );
    expect(d.title).toBe("Added customer open");
    expect(d.changes).toEqual(["Notes: paid", "Language: English"]);
  });

  it("names a payment by amount and bill, including a mark-as-paid", () => {
    const d = describeAudit(
      {
        action: "insert",
        table_name: "payments",
        record_id: "p1",
        old_value: null,
        new_value: {
          id: "p1",
          invoice_id: "inv-1",
          amount_applied: 250000,
          method: "no_transfer",
          reason: "Cash",
        },
      },
      names,
    );
    expect(d.title).toMatch(/^Recorded a payment of Rp\s?250\.000 on bill INV-0001$/);
    expect(d.changes).toContain("How it was paid: marked paid without a transfer");
    expect(d.changes).toContain("Reason: Cash");
  });

  it("falls back gracefully for removed references", () => {
    const d = describeAudit(
      {
        action: "update",
        table_name: "entries",
        record_id: "gone",
        old_value: { category_id: "cat-x" },
        new_value: { category_id: null },
      },
      new Map(),
    );
    expect(d.title).toBe("Changed a label on a transaction");
    expect(d.changes).toEqual(["Changed category from one that was removed to nothing"]);
  });
});
