import { describe, expect, it } from "vitest";
import { containsPattern, jumpsFor, matchJumps } from "./command-palette";

describe("command palette", () => {
  it("offers only what the person may open", () => {
    const viewer = jumpsFor("viewer").map((j) => j.href);
    expect(viewer).toContain("/money");
    expect(viewer).not.toContain("/money/new?dir=in");
    expect(viewer).not.toContain("/settings/team");
    expect(jumpsFor("operator").map((j) => j.href)).toContain("/money/new?dir=in");
    expect(jumpsFor("operator").map((j) => j.href)).not.toContain("/forecast");
    expect(jumpsFor("owner").map((j) => j.href)).toContain("/settings/team");
    expect(jumpsFor(null)).toEqual([]);
  });

  it("matches every typed word, in the name or its other words", () => {
    const all = jumpsFor("owner");
    expect(matchJumps(all, "").length).toBe(all.length);
    expect(matchJumps(all, "MONEY out").map((j) => j.label)).toEqual([
      "Record money out",
      "Money in & out",
    ]);
    expect(matchJumps(all, "audit").map((j) => j.label)).toEqual(["Change history"]);
    expect(matchJumps(all, "zzz")).toEqual([]);
    // from the start of a word: "co" is costs, not reCOrd
    expect(matchJumps(all, "co").map((j) => j.label)).not.toContain("Record money in");
  });

  it("searches for % _ and \\ as themselves", () => {
    expect(containsPattern("INV-2026")).toBe("%INV-2026%");
    expect(containsPattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
  });
});
