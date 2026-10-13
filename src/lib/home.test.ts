import { describe, expect, it } from "vitest";
import { headlineText, homeHeadline, trendSentence } from "./home";

describe("homeHeadline", () => {
  const said = (...a: Parameters<typeof homeHeadline>) => headlineText(homeHeadline(...a));
  it("cash and how long it lasts", () => {
    expect(said(250_000_000n, 14.7)).toBe(
      "You have Rp 250 jt in the bank — enough for about 14 months at your usual costs.",
    );
    expect(said(3_000_000n, 1.2)).toContain("about 1 month at");
    expect(said(3_000_000n, 0.4)).toContain("less than a month");
    expect(said(3_000_000n, null)).toBe("You have Rp 3 jt in the bank.");
    expect(said(3_000_000n, null, 2)).toContain("2 accounts don't report a balance");
  });
  it("each number opens its list", () => {
    const links = (...a: Parameters<typeof homeHeadline>) =>
      homeHeadline(...a).filter((p) => typeof p !== "string");
    expect(links(250_000_000n, 14.7)).toEqual([
      { text: "Rp 250 jt", opens: "cash" },
      { text: "about 14 months", opens: "runway" },
    ]);
    expect(links(3_000_000n, null)).toEqual([{ text: "Rp 3 jt", opens: "cash" }]);
  });
});

describe("trendSentence", () => {
  const m = (inn: number, out: number) => ({ came_in: BigInt(inn), went_out: BigInt(out) });
  it("counts the full months only (the last one is still running)", () => {
    expect(trendSentence([m(5, 1), m(1, 5), m(5, 1), m(0, 0), m(5, 1), m(0, 99)])).toBe(
      "More came in than went out in 3 of the last 4 months.",
    );
  });
  it("says every / none, and waits for history", () => {
    expect(trendSentence([m(5, 1), m(5, 1), m(0, 99)])).toBe(
      "More came in than went out in every one of the last 2 months.",
    );
    expect(trendSentence([m(1, 5), m(1, 5), m(9, 0)])).toBe(
      "More went out than came in in every one of the last 2 months.",
    );
    expect(trendSentence([m(0, 0), m(5, 1), m(9, 9)])).toBe(
      "Not enough months yet to see a pattern.",
    );
  });
});
