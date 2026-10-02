import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, createUser, tryQuery, withRollback, withRulesOff } from "./db";

const status = async (db: Client, signal: string, value: number) =>
  (await db.query("select health_status($1, $2) as s", [value, signal])).rows[0].s as string;

describe("health boundaries (default limits)", () => {
  const cases: [string, number, string][] = [
    // cash runway, months: healthy > 12, warning 6–12, danger < 6
    ["runway", 12.1, "healthy"],
    ["runway", 12, "warning"],
    ["runway", 6, "warning"],
    ["runway", 5.9, "danger"],
    // > 30 days late, % of owed: healthy < 10, warning 10–25, danger > 25
    ["late_share", 9.9, "healthy"],
    ["late_share", 10, "warning"],
    ["late_share", 25, "warning"],
    ["late_share", 25.1, "danger"],
    // renewal rate %: healthy > 90, warning 80–90, danger < 80
    ["renewal_rate", 90.1, "healthy"],
    ["renewal_rate", 90, "warning"],
    ["renewal_rate", 80, "warning"],
    ["renewal_rate", 79.9, "danger"],
    // biggest customer's share %: healthy < 20, warning 20–35, danger > 35
    ["top_customer_share", 19.9, "healthy"],
    ["top_customer_share", 20, "warning"],
    ["top_customer_share", 35, "warning"],
    ["top_customer_share", 35.1, "danger"],
  ];
  for (const [signal, value, expected] of cases) {
    it(`${signal} ${value} → ${expected}`, async () => {
      await withRollback(async (db) => expect(await status(db, signal, value)).toBe(expected));
    });
  }

  it("the owner's own limits are what count", async () => {
    await withRollback(async (db) => {
      await db.query("update health_thresholds set healthy_limit = 18, warning_limit = 9 where signal = 'runway'");
      expect(await status(db, "runway", 12.5)).toBe("warning");
      expect(await status(db, "runway", 8)).toBe("danger");
    });
  });

  it("limits must make sense, and only the owner changes them", async () => {
    await withRollback(async (db) => {
      expect(
        (await tryQuery(db, "update health_thresholds set warning_limit = 20 where signal = 'runway'")).error,
      ).toMatch(/check/); // warning above healthy for a higher-is-better signal
      await actAs(db, await createUser(db, "operator"));
      expect(
        (await tryQuery(db, "update health_thresholds set healthy_limit = 1 where signal = 'runway'")).rowCount,
      ).toBe(0);
    });
  });
});

let seq = 0;
async function month(db: Client, acct: string, day: string, inAmount: number, outAmount: number) {
  for (const [direction, amount] of [["in", inAmount], ["out", outAmount]] as const) {
    if (amount)
      await db.query(
        `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
         values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, $5, 'X')`,
        [acct, `health-${++seq}`, day, amount, direction],
      );
  }
}

async function snapshot(db: Client, on: string) {
  await db.query("set local role service_role");
  const { rows } = await db.query("select signal, value::text, status, explanation from take_health_snapshot($1)", [on]);
  await db.query("reset role");
  return Object.fromEntries(rows.map((r) => [r.signal, r]));
}

describe("net cashflow (3 months)", () => {
  async function setup(db: Client, nets: [number, number, number]) {
    await db.query("update bank_accounts set is_active = false");
    const acct = (
      await db.query(
        "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('BCA','T','0018','csv') returning id",
      )
    ).rows[0].id as string;
    const days = ["2031-04-10", "2031-05-10", "2031-06-10"];
    for (const [i, net] of nets.entries()) await month(db, acct, days[i], net > 0 ? net : 0, net < 0 ? -net : 0);
  }

  it("positive on average → healthy", async () => {
    await withRulesOff(async (db) => {
      await setup(db, [-1000, 5000, 2000]);
      expect((await snapshot(db, "2031-07-15")).net_cashflow).toMatchObject({ value: "2000", status: "healthy" });
    });
  });

  it("negative but not every month → warning", async () => {
    await withRulesOff(async (db) => {
      await setup(db, [-5000, 1000, -2000]);
      expect((await snapshot(db, "2031-07-15")).net_cashflow).toMatchObject({ value: "-2000", status: "warning" });
    });
  });

  it("negative three months running → danger, and the sentence says so", async () => {
    await withRulesOff(async (db) => {
      await setup(db, [-1000, -1000, -1000]);
      const net = (await snapshot(db, "2031-07-15")).net_cashflow;
      expect(net).toMatchObject({ value: "-1000", status: "danger" });
      expect(net.explanation).toBe(
        "Over the last 3 months, about Rp 1.000 more went out than came in each month — every one of them.",
      );
    });
  });
});

describe("snapshots", () => {
  it("a changed limit shows in the next snapshot; the earlier one stays as it was", async () => {
    await withRulesOff(async (db) => {
      await db.query("update invoices set status = 'void', transfer_amount = null, void_reason = 't' where status in ('open','partly_paid')");
      await db.query("set local role service_role");
      const customer = (await db.query("select id from customers limit 1")).rows[0].id;
      await db.query("select create_invoice($1, 1000000, '2031-01-01', '2031-02-01')", [customer]); // 100% late
      await db.query("reset role");

      expect((await snapshot(db, "2031-07-01")).late_share).toMatchObject({ value: "100.0", status: "danger" });
      await db.query("update health_thresholds set healthy_limit = 101, warning_limit = 101 where signal = 'late_share'");
      expect((await snapshot(db, "2031-07-02")).late_share).toMatchObject({ status: "healthy" });
      const { rows } = await db.query(
        "select status from health_snapshots where taken_on = '2031-07-01' and signal = 'late_share'",
      );
      expect(rows[0].status).toBe("danger");
    });
  });

  it("only the daily job takes them", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "owner"));
      expect((await tryQuery(db, "select take_health_snapshot()")).error).toMatch(/permission denied/);
    });
  });
});
