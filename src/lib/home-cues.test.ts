import { describe, expect, it } from "vitest";
import { arrange, available, rearrange } from "./home-cues";

describe("cue sets per role", () => {
  it("the owner starts on money and customers; the operator on the day's work", () => {
    expect(arrange("owner", null).shown.slice(0, 2)).toEqual(["cash", "forecast_low"]);
    expect(arrange("operator", null).shown[0]).toBe("needs_label");
  });

  it("nobody is offered a cue that opens a page they can't", () => {
    expect(available("operator")).not.toContain("forecast_low"); // forecast: owner and viewer
    expect(available("viewer")).toContain("forecast_low");
    expect(available("viewer")).not.toContain("marked_paid"); // weekly summary: owner only
    // the viewer gets the owner's view without it
    expect(arrange("viewer", null).shown).toEqual(
      arrange("owner", null).shown.filter((id) => id !== "marked_paid"),
    );
  });

  it("a saved arrangement keeps its order; unknown, repeated and forbidden ids are dropped", () => {
    const { shown, hidden } = arrange("operator", [
      "went_out",
      "x",
      "forecast_low",
      "went_out",
      "cash",
    ]);
    expect(shown).toEqual(["went_out", "cash"]);
    expect(hidden).toContain("needs_label");
    expect(hidden).not.toContain("forecast_low");
    expect(arrange("owner", []).shown).toEqual([]); // everything hidden is allowed
  });
});

describe("rearrange", () => {
  const s = ["cash", "runway", "dso"] as const;
  it("moves one place, hides, shows at the end; edges and unknowns change nothing", () => {
    expect(rearrange([...s], "up:runway")).toEqual(["runway", "cash", "dso"]);
    expect(rearrange([...s], "down:runway")).toEqual(["cash", "dso", "runway"]);
    expect(rearrange([...s], "up:cash")).toEqual([...s]);
    expect(rearrange([...s], "down:dso")).toEqual([...s]);
    expect(rearrange([...s], "hide:runway")).toEqual(["cash", "dso"]);
    expect(rearrange([...s], "show:cei")).toEqual([...s, "cei"]);
    expect(rearrange([...s], "show:cash")).toEqual([...s]);
    expect(rearrange([...s], "show:nope")).toEqual([...s]);
    expect(rearrange([...s], "drop:cash")).toEqual([...s]);
  });
});
