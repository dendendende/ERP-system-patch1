import { describe, expect, it } from "vitest";
import { panelHref } from "./analytical-list-page";

describe("panelHref", () => {
  it("opens and closes a row without touching the list's own filters", () => {
    expect(panelHref("/money?dir=in&sort=amount_desc", "abc")).toBe(
      "/money?dir=in&sort=amount_desc&open=abc",
    );
    expect(panelHref("/money?dir=in&open=abc", "xyz")).toBe("/money?dir=in&open=xyz");
    expect(panelHref("/money?dir=in&open=abc", null)).toBe("/money?dir=in");
    expect(panelHref("/money?open=abc", null)).toBe("/money");
    expect(panelHref("/money", "a b")).toBe("/money?open=a+b");
  });
});
