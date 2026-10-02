import { describe, expect, it } from "vitest";
import { type ClaimedReminder, type SenderStore, runSender, withinSendingHours } from "./sender";

const at = (jakarta: string) => new Date(`2026-09-25T${jakarta}:00+07:00`);

describe("withinSendingHours", () => {
  it("uses Jakarta time, from the start hour up to (not including) the end hour", () => {
    expect(withinSendingHours(at("07:59"))).toBe(false);
    expect(withinSendingHours(at("08:00"))).toBe(true);
    expect(withinSendingHours(at("18:59"))).toBe(true);
    expect(withinSendingHours(at("19:00"))).toBe(false);
    // 02:00 UTC is 09:00 in Jakarta
    expect(withinSendingHours(new Date("2026-09-25T02:00:00Z"))).toBe(true);
    expect(withinSendingHours(at("20:30"), "09-21")).toBe(true);
  });

  it("refuses a setting it can't read", () => {
    expect(() => withinSendingHours(at("10:00"), "8am-7pm")).toThrow(/08-19/);
  });
});

function fakeStore(due: ClaimedReminder[]) {
  const recorded: [string, unknown][] = [];
  let claims = 0;
  const store: SenderStore = {
    failStaleClaims: async () => 0,
    claim: async () => (claims++ === 0 ? due : []), // like the database: handed out once
    record: async (id, result) => {
      recorded.push([id, result]);
    },
  };
  return { store, recorded };
}

const reminder = (id: string, channel = "whatsapp"): ClaimedReminder => ({
  id,
  invoice_id: "inv",
  channel,
  template_key: "reminder",
  kind: "reminder",
  scheduled_for: "2026-09-25T01:00:00Z",
  amount_to_transfer: "1500001",
  still_owed: "1500000",
});

describe("runSender", () => {
  it("sends each claimed reminder once and records it; a second run sends nothing", async () => {
    const { store, recorded } = fakeStore([reminder("a"), reminder("b")]);
    const sentIds: string[] = [];
    const channels = {
      whatsapp: { send: async (r: ClaimedReminder) => (sentIds.push(r.id), { providerMessageId: `m-${r.id}` }) },
    };
    expect(await runSender({ store, channels, now: at("10:00") })).toEqual({
      claimed: 2,
      sent: 2,
      failed: 0,
      stale: 0,
    });
    await runSender({ store, channels, now: at("10:15") });
    expect(sentIds).toEqual(["a", "b"]);
    expect(recorded).toEqual([
      ["a", { sent: true, providerMessageId: "m-a", amountShown: 1500001n }],
      ["b", { sent: true, providerMessageId: "m-b", amountShown: 1500001n }],
    ]);
  });

  it("a failure is recorded and doesn't stop the rest", async () => {
    const { store, recorded } = fakeStore([reminder("a"), reminder("b", "email"), reminder("c")]);
    const channels = {
      whatsapp: {
        send: async (r: ClaimedReminder) => {
          if (r.id === "a") throw new Error("provider down");
          return { providerMessageId: `m-${r.id}` };
        },
      },
    };
    expect(await runSender({ store, channels, now: at("10:00") })).toMatchObject({
      sent: 1,
      failed: 2,
    });
    expect(recorded).toEqual([
      ["a", { sent: false, error: "provider down" }],
      ["b", { sent: false, error: "No way to send by email yet" }],
      ["c", { sent: true, providerMessageId: "m-c", amountShown: 1500001n }],
    ]);
  });

  it("claims nothing outside sending hours", async () => {
    const { store, recorded } = fakeStore([reminder("a")]);
    expect(await runSender({ store, channels: {}, now: at("21:00") })).toEqual({
      skipped: "outside sending hours",
    });
    expect(recorded).toEqual([]);
  });
});
