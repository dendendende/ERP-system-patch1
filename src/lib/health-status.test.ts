import { describe, expect, it } from "vitest";
import { HEALTH_TONE, worstStatus } from "./health-status";

describe("health status", () => {
  it("the overall status is the worst one", () => {
    expect(worstStatus(["healthy", "danger", "warning"])).toBe("danger");
    expect(worstStatus(["healthy", "warning"])).toBe("warning");
    expect(worstStatus(["healthy"])).toBe("healthy");
    expect(worstStatus([])).toBeNull();
    expect(worstStatus(["something else"])).toBeNull();
  });

  it("each status has its own colour", () => {
    expect(new Set(Object.values(HEALTH_TONE)).size).toBe(3);
  });
});
