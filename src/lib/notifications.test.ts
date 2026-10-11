import { describe, expect, it } from "vitest";
import { describeNotification, syncNotice } from "./notifications";

const row = { id: "n1", at: "2026-10-11T03:00:00Z", is_new: true, detail: null, link_id: "x1" };

describe("describeNotification", () => {
  it("a balance that doesn't add up says by how much, which way, and opens that account's money", () => {
    const n = describeNotification({
      ...row,
      kind: "mismatch",
      amount: "-150000",
      who: "BCA ••1234",
      detail: "Some days are missing",
    });
    expect(n.title).toBe(
      "BCA ••1234 doesn't add up: the bank shows Rp 150.000 less than our records",
    );
    expect(n).toMatchObject({
      detail: "Some days are missing",
      href: "/money?account=x1",
      tone: "problem",
    });
  });

  it("a failed reminder opens the customer; a big new payee opens the payment", () => {
    expect(
      describeNotification({
        ...row,
        kind: "failed_delivery",
        amount: null,
        who: "PT Maju",
        detail: "Mailbox full",
      }),
    ).toMatchObject({ title: "A reminder to PT Maju couldn't be sent", href: "/customers/x1" });
    expect(
      describeNotification({ ...row, kind: "new_payee", amount: "25000000", who: "TRSF PT BARU" }),
    ).toMatchObject({
      title: "Rp 25.000.000 went to someone not paid before",
      detail: "TRSF PT BARU",
      href: "/money?open=x1",
      tone: "attention",
    });
  });
});

describe("syncNotice", () => {
  it("only while the bank is stale, and always counted as new", () => {
    expect(
      syncNotice({ tone: "in", message: "Bank updated 1 hour ago", stale: false }, 6),
    ).toBeNull();
    expect(
      syncNotice(
        { tone: "attention", message: "No bank update since 9 hours ago", stale: true },
        6,
      ),
    ).toMatchObject({
      title: "No bank update since 9 hours ago",
      isNew: true,
      href: "/settings/bank",
    });
  });
});
