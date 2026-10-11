import { describe, expect, it } from "vitest";
import { bulkIds, bulkOutcome } from "./bulk";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("bulkOutcome", () => {
  it("says how many were done, and groups the rest by why", () => {
    expect(
      bulkOutcome(
        [
          { id: id(1), error: null },
          { id: id(2), error: null },
          { id: id(3), error: "This customer has no email address" },
          { id: id(4), error: "This customer has no email address" },
          { id: id(5), error: "A reminder for this bill already went out today" },
        ],
        (n) => `${n} reminders are on the list.`,
      ),
    ).toBe(
      "2 reminders are on the list. 2 not: This customer has no email address. 1 not: a reminder for it already went out today.",
    );
  });

  it("says plainly when nothing changed", () => {
    expect(
      bulkOutcome(
        [{ id: id(1), error: "Category does not match the direction of this money (in)" }],
        (n) => `${n} labelled.`,
      ),
    ).toBe("Nothing was changed. 1 not: it went the other way (money in vs money out).");
  });
});

describe("bulkIds", () => {
  it("keeps only ids, at most 1,000", () => {
    expect(bulkIds([id(1), "x'; drop", 7, id(2)])).toEqual([id(1), id(2)]);
    expect(bulkIds("nope")).toEqual([]);
    expect(bulkIds(Array.from({ length: 1200 }, (_, i) => id(i)))).toHaveLength(1000);
  });
});
