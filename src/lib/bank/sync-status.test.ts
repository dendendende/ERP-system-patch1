import { describe, expect, it } from "vitest";
import { syncState, timeAgo } from "./sync-status";

const now = new Date("2026-09-20T12:00:00+07:00");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("timeAgo", () => {
  it.each([
    [0.5, "just now"],
    [1, "1 minute ago"],
    [45, "45 minutes ago"],
    [60, "1 hour ago"],
    [300, "5 hours ago"],
    [60 * 25, "1 day ago"],
    [60 * 24 * 3, "3 days ago"],
  ])("%s minutes ago reads as %s", (minutes, expected) => {
    expect(timeAgo(new Date(now.getTime() - minutes * 60_000), now)).toBe(expected);
  });
});

describe("syncState", () => {
  it("says nothing is connected when there are no bank connections", () => {
    expect(syncState({ connectedAccounts: 0, lastSyncedAt: hoursAgo(99) }, now)).toMatchObject({
      message: "Bank not connected yet",
      stale: false,
    });
  });

  it("is fresh within the window, stale past it", () => {
    expect(syncState({ connectedAccounts: 1, lastSyncedAt: hoursAgo(5) }, now)).toEqual({
      tone: "in",
      message: "Bank updated 5 hours ago",
      stale: false,
    });
    expect(syncState({ connectedAccounts: 1, lastSyncedAt: hoursAgo(7) }, now)).toEqual({
      tone: "attention",
      message: "No bank update since 7 hours ago",
      stale: true,
    });
  });

  it("uses the configured window", () => {
    expect(syncState({ connectedAccounts: 1, lastSyncedAt: hoursAgo(7) }, now, 12).stale).toBe(
      false,
    );
    expect(syncState({ connectedAccounts: 1, lastSyncedAt: hoursAgo(2) }, now, 1).stale).toBe(true);
  });

  it("flags a connection that has never synced", () => {
    expect(syncState({ connectedAccounts: 2, lastSyncedAt: null }, now)).toMatchObject({
      stale: true,
      tone: "attention",
    });
  });
});
