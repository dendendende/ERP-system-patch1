import { describe, expect, it } from "vitest";
import { NOT_SAVED, NOT_YOURS, answer } from "./db-error";

describe("answer", () => {
  it("says nothing when the write saved a row", () => {
    expect(answer({ error: null, data: [{ id: "1" }] })).toEqual({});
  });
  it("passes on our own checks' words, and puts anything else plainly", () => {
    const ours = { code: "23514", message: "This money paid a bill, so it can't be cancelled" };
    expect(answer({ error: ours, data: null })).toEqual({ error: ours.message });
    const raised = { code: "P0001", message: "Choose an account" };
    expect(answer({ error: raised, data: null })).toEqual({ error: raised.message });
    const postgres = {
      code: "42501",
      message: 'new row violates row-level security policy for table "x"',
    };
    expect(answer({ error: postgres, data: null })).toEqual({ error: NOT_SAVED });
  });
  it("says so when row-level security let it change nothing", () => {
    expect(answer({ error: null, data: [] })).toEqual({ error: NOT_YOURS });
  });
});
