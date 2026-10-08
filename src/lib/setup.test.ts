import { describe, expect, it } from "vitest";
import { type SetupFacts, setupProgress } from "./setup";

const empty: SetupFacts = {
  bankAccounts: 0,
  transactions: 0,
  needsLabel: 0,
  labelledByPeople: 0,
  activeSubscriptions: 0,
  regularCosts: 0,
  teamMembers: 1,
};

describe("setupProgress", () => {
  it("a new business starts at step one with nothing done", () => {
    const p = setupProgress(empty, new Set());
    expect(p.doneCount).toBe(0);
    expect(p.next?.id).toBe("bank");
  });

  it("steps tick themselves off from the data", () => {
    const p = setupProgress(
      { ...empty, bankAccounts: 1, transactions: 40, needsLabel: 3, labelledByPeople: 2 },
      new Set(),
    );
    expect(p.steps.filter((s) => s.done).map((s) => s.id)).toEqual(["bank", "money"]);
    expect(p.next?.id).toBe("labels"); // 3 still need a label and only 2 labelled by people

    const labelled = setupProgress(
      { ...empty, bankAccounts: 1, transactions: 40, needsLabel: 0 },
      new Set(),
    );
    expect(labelled.next?.id).toBe("customers");
  });

  it("labels aren't done just because there's nothing to label yet", () => {
    expect(setupProgress(empty, new Set()).steps.find((s) => s.id === "labels")?.done).toBe(false);
  });

  it("a step marked done or skipped stays done, and resuming starts at the first open one", () => {
    const p = setupProgress({ ...empty, bankAccounts: 1 }, new Set(["money", "reminders"]));
    expect(p.steps.filter((s) => s.done).map((s) => s.id)).toEqual(["bank", "money", "reminders"]);
    expect(p.next?.id).toBe("labels");
  });

  it("everything done: no next step", () => {
    const p = setupProgress(
      {
        bankAccounts: 1,
        transactions: 10,
        needsLabel: 0,
        labelledByPeople: 0,
        activeSubscriptions: 2,
        regularCosts: 3,
        teamMembers: 2,
      },
      new Set(["reminders"]),
    );
    expect(p.doneCount).toBe(p.total);
    expect(p.next).toBeNull();
  });
});
