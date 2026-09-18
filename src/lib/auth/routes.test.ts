import { describe, expect, it } from "vitest";
import { canAccess, isSessionExpired, requiredRole } from "./routes";

describe("route roles", () => {
  it("an operator cannot access owner-only routes", () => {
    expect(canAccess("operator", "/settings/team")).toBe(false);
    expect(canAccess("operator", "/settings/team/invite")).toBe(false);
    expect(canAccess("operator", "/settings/audit-log")).toBe(false);
    expect(canAccess("viewer", "/settings/team")).toBe(false);
    expect(canAccess("owner", "/settings/team")).toBe(true);
  });

  it("everyone signed in can open normal pages", () => {
    for (const role of ["owner", "operator", "viewer"] as const) {
      expect(canAccess(role, "/")).toBe(true);
      expect(canAccess(role, "/money")).toBe(true);
      expect(canAccess(role, "/settings")).toBe(true);
    }
  });

  it("no role (no profile / no 2FA) gets nothing", () => {
    expect(canAccess(null, "/")).toBe(false);
    expect(canAccess(undefined, "/money")).toBe(false);
  });

  it("matches whole path segments only", () => {
    expect(requiredRole("/settings/teamwork")).toBe("viewer");
    expect(requiredRole("/settings/team")).toBe("owner");
  });
});

describe("isSessionExpired", () => {
  const min = 60_000;
  it("expires after the inactivity window", () => {
    expect(isSessionExpired(0, 31 * min, 30)).toBe(true);
    expect(isSessionExpired(0, 30 * min, 30)).toBe(false);
    expect(isSessionExpired(null, 999 * min, 30)).toBe(false);
  });
});
