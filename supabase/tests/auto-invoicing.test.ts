import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, createUser, tryQuery, withRollback } from "./db";

/** A customer with one subscription: next invoice `in_days` from today (Jakarta). */
async function subscription(
  db: Client,
  in_days: number,
  extra: { cycle?: string; end_in_days?: number; status?: string } = {},
) {
  const customer = (
    await db.query("insert into customers (name) values ('Auto invoice test') returning id")
  ).rows[0].id as string;
  const { rows } = await db.query(
    `insert into subscriptions
       (customer_id, plan_name, price, cycle, start_date, end_date, next_invoice_date, status)
     values ($1, 'Starter', 331000000, $2, jakarta_today() - 30,
             case when $3::int is null then null else jakarta_today() + $3::int end,
             jakarta_today() + $4::int, $5)
     returning id`,
    [
      customer,
      extra.cycle ?? "monthly",
      extra.end_in_days ?? null,
      in_days,
      extra.status ?? "active",
    ],
  );
  return { customer, id: rows[0].id as string };
}

/** Run the job as the job's own identity, then back to postgres. */
async function runJob(db: Client, leadDays?: number) {
  await db.query("set local role service_role");
  const { rows } = await db.query(
    leadDays === undefined
      ? "select create_due_invoices() as n"
      : `select create_due_invoices(${leadDays}) as n`,
  );
  await db.query("reset role");
  return rows[0].n as number;
}

async function invoicesFor(db: Client, sub: string) {
  const { rows } = await db.query(
    "select issued_on::text, due_on::text, base_amount::text from invoices where subscription_id = $1 order by due_on",
    [sub],
  );
  return rows as { issued_on: string; due_on: string; base_amount: string }[];
}

const nextDate = async (db: Client, sub: string) =>
  (await db.query("select next_invoice_date::text, status from subscriptions where id = $1", [sub]))
    .rows[0] as { next_invoice_date: string; status: string };

describe("the invoicing job", () => {
  it("invoices what is due within the lead time, issued today, due on the renewal day", async () => {
    await withRollback(async (db) => {
      const soon = await subscription(db, 10);
      const later = await subscription(db, 20);
      await runJob(db);

      const [inv] = await invoicesFor(db, soon.id);
      const { rows } = await db.query(
        "select jakarta_today()::text as today, (jakarta_today() + 10)::text as renewal",
      );
      expect(inv).toEqual({
        issued_on: rows[0].today,
        due_on: rows[0].renewal,
        base_amount: "331000000",
      });
      expect(await invoicesFor(db, later.id)).toEqual([]);
    });
  });

  it("running it again on the same day creates nothing extra", async () => {
    await withRollback(async (db) => {
      const s = await subscription(db, 3);
      expect(await runJob(db)).toBeGreaterThanOrEqual(1);
      await runJob(db);
      await runJob(db);
      expect(await invoicesFor(db, s.id)).toHaveLength(1);
    });
  });

  it("moves the subscription on by its cycle", async () => {
    await withRollback(async (db) => {
      for (const [cycle, months] of [
        ["monthly", 1],
        ["quarterly", 3],
        ["yearly", 12],
      ] as const) {
        const s = await subscription(db, 0, { cycle });
        await runJob(db);
        const { rows } = await db.query(
          `select (jakarta_today() + make_interval(months => $1))::date::text as expected`,
          [months],
        );
        expect((await nextDate(db, s.id)).next_invoice_date).toBe(rows[0].expected);
      }
    });
  });

  it("skips paused and ended subscriptions, and ends one past its end date", async () => {
    await withRollback(async (db) => {
      const paused = await subscription(db, 1, { status: "paused" });
      const last = await subscription(db, 1, { end_in_days: 20 }); // one cycle left
      await runJob(db);
      expect(await invoicesFor(db, paused.id)).toEqual([]);
      expect(await invoicesFor(db, last.id)).toHaveLength(1);
      expect((await nextDate(db, last.id)).status).toBe("ended");

      await runJob(db);
      expect(await invoicesFor(db, last.id)).toHaveLength(1);
    });
  });

  it("a longer lead time invoices further ahead", async () => {
    await withRollback(async (db) => {
      const s = await subscription(db, 25);
      await runJob(db);
      expect(await invoicesFor(db, s.id)).toEqual([]);
      await runJob(db, 30);
      expect(await invoicesFor(db, s.id)).toHaveLength(1);
    });
  });

  it("a renewal day already past (job missed days) is billed due today, and nobody is skipped", async () => {
    await withRollback(async (db) => {
      const missed = await subscription(db, -3);
      const onTime = await subscription(db, 5);
      expect(await runJob(db)).toBeGreaterThanOrEqual(2);
      const today = (await db.query("select jakarta_today()::text t")).rows[0].t;
      expect(await invoicesFor(db, missed.id)).toEqual([
        { issued_on: today, due_on: today, base_amount: "331000000" },
      ]);
      expect(await invoicesFor(db, onTime.id)).toHaveLength(1);
    });
  });

  it("only the job can run it", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "owner"));
      expect((await tryQuery(db, "select create_due_invoices()")).error).toMatch(
        /permission denied/,
      );
    });
  });

  it("one invoice per subscription and period, whatever happens", async () => {
    await withRollback(async (db) => {
      const s = await subscription(db, 5);
      await runJob(db);
      const due = (await invoicesFor(db, s.id))[0].due_on;
      await db.query("set local role service_role");
      const res = await tryQuery(
        db,
        "select create_invoice($1, 331000000, jakarta_today(), $2, $3)",
        [s.customer, due, s.id],
      );
      await db.query("reset role");
      expect(res.error).toMatch(/duplicate key|unique/);
    });
  });
});
