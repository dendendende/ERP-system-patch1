import { type Client, types } from "pg";
import { describe, expect, it } from "vitest";
import {
  agingDetail,
  cashflowStatement,
  customerStatement,
  spendByCategory,
  statementMonths,
} from "../../src/lib/report-library";
import { actAs, actAsAdmin, createUser, withRulesOff } from "./db";

const M = 1_000_000n;
let seq = 0;

const DATE = 1082; // Postgres' type id for date
const asText = {
  getTypeParser: (oid: number, format?: "text" | "binary") =>
    oid === DATE ? (v: string) => v : types.getTypeParser(oid, format),
};

/**
 * Just enough of supabase-js for a report's run(): rpc(fn, args).select(cols)[.gt][.order][.single]
 * — run as SQL on this test's connection (inside its rolled-back transaction), so the report's
 * own code does the arithmetic on real database results.
 */
function viaPg(db: Client) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      return {
        select(cols: string) {
          const where: string[] = [];
          const order: string[] = [];
          const params = Object.values(args);
          const run = async () => {
            const named = Object.keys(args).map((k, i) => `${k} => $${i + 1}`);
            const sql = `select ${cols} from public.${fn}(${named.join(", ")})${where.length ? ` where ${where.join(" and ")}` : ""}${order.length ? ` order by ${order.join(", ")}` : ""}`;
            // dates as text (YYYY-MM-DD), as the real client returns them; pg would make Dates
            const { rows } = await db.query({ text: sql, values: params, types: asText });
            return { data: rows, error: null };
          };
          const q = {
            gt(col: string, v: number) {
              where.push(`${col} > ${Number(v)}`);
              return q;
            },
            eq(col: string, v: string) {
              params.push(v);
              where.push(`${col} = $${params.length}`);
              return q;
            },
            order(col: string) {
              order.push(col);
              return q;
            },
            single: async () => {
              const r = await run();
              return { data: r.data[0], error: null };
            },
            then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
              run().then(ok, bad),
          };
          return q;
        },
      };
    },
  } as never;
}

async function account(db: Client) {
  return (
    await db.query(
      "insert into bank_accounts (bank_name, account_name, account_last4, source) values ('CF', 'T', '0031', 'csv') returning id",
    )
  ).rows[0].id as string;
}

/** A transaction on `day` (10:00 Jakarta), labelled `category` (a name; null = needs a label). */
async function tx(
  db: Client,
  acct: string,
  day: string,
  dir: "in" | "out",
  amount: bigint,
  o: { balance?: bigint; category?: string | null; byHand?: string } = {},
) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw, balance_after, entered_by)
     values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, $5, 'CF TEST', $6, $7) returning id`,
    [
      acct,
      `${o.byHand ? "hand:" : "cf-"}${++seq}`,
      day,
      String(amount),
      dir,
      o.balance === undefined ? null : String(o.balance),
      o.byHand ?? null,
    ],
  );
  if (o.category !== undefined && o.category !== null) {
    await db.query(
      "update entries set category_id = (select id from categories where name = $2 and type = $3), status = 'labelled' where bank_transaction_id = $1",
      [rows[0].id, o.category, dir],
    );
  }
}

describe("the cashflow statement (hand-calculated)", () => {
  it("start + came in − went out = end, month by month; what the balances moved by otherwise is shown", async () => {
    await withRulesOff(async (db) => {
      await db.query("update bank_accounts set is_active = false"); // only this test's accounts
      const a = await account(db);
      const b = await account(db);
      const someone = await createUser(db, "operator");

      // 31 Jan: account A's balance is 10 jt (account B reports none yet)
      await tx(db, a, "2031-01-31", "in", 1n * M, { balance: 10n * M, category: "Other income" });
      // February: 5 in, 2 out; 1 moved from A to B (an own transfer: in no total)
      await tx(db, a, "2031-02-05", "in", 5n * M, {
        balance: 15n * M,
        category: "Subscription income",
      });
      await tx(db, a, "2031-02-10", "out", 2n * M, { balance: 13n * M, category: "Rent" });
      await tx(db, a, "2031-02-12", "out", 1n * M, {
        balance: 12n * M,
        category: "Transfer between own accounts",
      });
      await tx(db, b, "2031-02-12", "in", 1n * M, {
        balance: 1n * M,
        category: "Transfer between own accounts",
      });
      // March: 0.5 out not labelled yet; 2 in typed by hand (the bank never showed it)
      await tx(db, a, "2031-03-03", "out", M / 2n, { balance: 11n * M + M / 2n });
      await tx(db, a, "2031-03-20", "in", 2n * M, { byHand: someone, category: "Other income" });

      const months = statementMonths("2031-02", "2031-03", "2031-04-15");
      expect(months).toEqual(["2031-02-01", "2031-03-01"]);
      const r = await cashflowStatement(viaPg(db), months, "2031-04-15");
      const line = (label: string) => {
        const row = r.rows.find((x) => x.cells.line === label);
        return row && [row.cells["m2031-02"], row.cells["m2031-03"], row.cells.total];
      };
      const jt = (...xs: number[]) => xs.map((x) => BigInt(Math.round(x * 1_000_000)));

      // February: 10 + 5 − 2 = 13 = A 12 + B 1 → nothing unexplained (the transfer nets out)
      // March: 13 + 2 − 0.5 = 14.5, but the banks show 12.5 → 2 not explained (the hand entry)
      expect(line("Cash in the bank at the start")).toEqual(jt(10, 13, 10));
      expect(line("Subscription income")).toEqual(jt(5, 0, 5));
      expect(line("Other income")).toEqual(jt(0, 2, 2));
      expect(line("Came in")).toEqual(jt(5, 2, 7));
      expect(line("Rent")).toEqual(jt(2, 0, 2));
      expect(line("Needs a label")).toEqual(jt(0, 0.5, 0.5));
      expect(line("Went out")).toEqual(jt(2, 0.5, 2.5));
      expect(line("Left over (came in − went out)")).toEqual(jt(3, 1.5, 4.5));
      expect(line("Cash in the bank at the end")).toEqual(jt(13, 12.5, 12.5));
      expect(line("Not explained by the transactions")).toEqual(jt(0, -2, -2));
      // own transfers are no line of their own
      expect(r.rows.some((x) => x.cells.line === "Transfer between own accounts")).toBe(false);
      // on 31 Jan account B reported no balance yet: said so
      expect(r.notes?.some((n) => n.includes("1 active account doesn't report a balance"))).toBe(
        true,
      );
      // each category line opens its transactions for the whole period
      expect(r.rows.find((x) => x.cells.line === "Needs a label")?.href).toBe(
        "/money?dir=out&status=needs_label&from=2031-02-01&to=2031-03-31",
      );

      // spend by category over the same months adds up to the statement's "went out"
      const spend = await spendByCategory(viaPg(db), months, "2031-04-15");
      expect(spend.rows.map((x) => [x.cells.category, x.cells.total])).toEqual([
        ["Rent", 2n * M],
        ["Needs a label", M / 2n],
      ]);
      expect(spend.totals!.total).toBe(line("Went out")![2]);
      expect(spend.totals!.month).toBe(1_250_000n); // 2.5 jt over 2 months
    });
  });

  it("months: either order, never past this month, at most 12", () => {
    expect(statementMonths("2026-12", "2026-09", "2026-10-10")).toEqual([
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(statementMonths("2024-01", "2026-10", "2026-10-10")).toHaveLength(12);
    expect(statementMonths("2027-01", "2027-03", "2026-10-10")).toEqual(["2026-10-01"]);
  });
});

describe("the aging detail (hand-calculated)", () => {
  it("every bill owed that day, in its lateness column; the totals are the receivables aging", async () => {
    await withRulesOff(async (db) => {
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'test' where status in ('open', 'partly_paid')",
      );
      const bill = async (base: bigint, issued: string, due: string) => {
        await db.query("set local role service_role");
        const { rows } = await db.query(
          "select id from create_invoice((select id from customers order by created_at limit 1), $1, $2, $3)",
          [String(base), issued, due],
        );
        await db.query("reset role");
        return rows[0].id as string;
      };
      await bill(12n * M, "2031-06-01", "2031-07-01"); // not due on 30 June
      await bill(4n * M, "2031-05-15", "2031-05-31"); // 30 days late
      await bill(10n * M, "2031-03-01", "2031-03-31"); // 91 days late
      await bill(3n * M, "2031-07-02", "2031-07-30"); // written after the day: not there

      const r = await agingDetail(viaPg(db), "2031-06-30");
      expect(r.rows.map((x) => [x.cells.late, x.cells.owed])).toEqual(
        expect.arrayContaining([
          [0, 12n * M],
          [30, 4n * M],
          [91, 10n * M],
        ]),
      );
      expect(r.rows).toHaveLength(3);
      // each amount sits in one column only
      const late30 = r.rows.find((x) => x.cells.late === 30)!.cells;
      expect([late30.b0, late30.b1, late30.b2, late30.b3, late30.b4]).toEqual([
        null,
        4n * M,
        null,
        null,
        null,
      ]);
      const aging = (await db.query("select aging from receivables_summary('2031-06-30')")).rows[0]
        .aging as string[];
      expect([0, 1, 2, 3, 4].map((b) => r.totals![`b${b}`])).toEqual(aging.map((x) => BigInt(x)));
      expect(r.totals!.owed).toBe(26n * M);
    });
  });
});

describe("the customer statement (hand-calculated)", () => {
  it("owed at the start + each bill − each payment or cancellation = owed at the end", async () => {
    await withRulesOff(async (db) => {
      const customer = (
        await db.query("insert into customers (name) values ('Statement Test') returning id")
      ).rows[0].id as string;
      const acct = await account(db);
      const operator = await createUser(db, "operator");
      const bill = async (base: bigint, issued: string, due: string) => {
        await db.query("set local role service_role");
        const { rows } = await db.query("select id from create_invoice($1, $2, $3, $4)", [
          customer,
          String(base),
          issued,
          due,
        ]);
        await db.query("reset role");
        return rows[0].id as string;
      };
      const pay = async (invoice: string, day: string, amount: bigint) => {
        const { rows } = await db.query(
          `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
           values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, 'in', 'ST') returning id`,
          [acct, `st-${++seq}`, day, String(amount)],
        );
        await actAs(db, operator);
        await db.query("select apply_payment($1, $2, $3)", [invoice, rows[0].id, String(amount)]);
        await actAsAdmin(db);
      };

      const c = await bill(3n * M, "2031-05-20", "2031-06-20"); // owed before the statement starts
      const a = await bill(10n * M, "2031-06-01", "2031-06-30");
      const d = await bill(8n * M, "2031-06-02", "2031-07-02");
      const b = await bill(5n * M, "2031-06-05", "2031-07-05");
      await pay(d, "2031-06-10", 4n * M);
      await pay(b, "2031-06-15", 1n * M);
      // A paid with its unique amount: 10 jt and the code's digits — only the 10 jt was owed
      const transfer = BigInt(
        (await db.query("select transfer_amount from invoices where id = $1", [a])).rows[0]
          .transfer_amount,
      );
      expect(transfer).toBeGreaterThan(10n * M);
      await pay(a, "2031-06-20", transfer);
      // B cancelled on 25 June with 4 jt still owed
      await db.query(
        "update invoices set status = 'void', transfer_amount = null, void_reason = 'test' where id = $1",
        [b],
      );
      await db.query("update invoices set voided_at = '2031-06-25T09:00:00+07' where id = $1", [b]);
      // C marked paid without a transfer on 28 June
      await db.query(
        "insert into payments (invoice_id, amount_applied, method, reason, created_at) values ($1, $2, 'no_transfer', 'cash', '2031-06-28T10:00:00+07')",
        [c, String(3n * M)],
      );

      const r = await customerStatement(viaPg(db), customer, "2031-06-01", "2031-06-30");
      expect(
        r.rows.map((x) => [x.cells.day, x.cells.what, x.cells.added, x.cells.paid, x.cells.owed]),
      ).toEqual([
        ["2031-05-31", "Owed at the start", null, null, 3n * M],
        ["2031-06-01", "Bill", 10n * M, null, 13n * M],
        ["2031-06-02", "Bill", 8n * M, null, 21n * M],
        ["2031-06-05", "Bill", 5n * M, null, 26n * M],
        ["2031-06-10", "Payment", null, 4n * M, 22n * M],
        ["2031-06-15", "Payment", null, 1n * M, 21n * M],
        ["2031-06-20", "Payment", null, 10n * M, 11n * M], // not the code's digits
        ["2031-06-25", "Bill cancelled", null, 4n * M, 7n * M],
        ["2031-06-28", "Marked paid without a transfer", null, 3n * M, 4n * M],
      ]);
      // ends on what invoice_owed_on says is owed — D's 4 jt — and says nothing is wrong
      expect(r.totals).toMatchObject({ added: 23n * M, paid: 22n * M, owed: 4n * M });
      expect(r.notes?.some((n) => n.includes("should never happen"))).toBe(false);
      // a shorter window starts from what was owed the day before it
      const late = await customerStatement(viaPg(db), customer, "2031-06-21", "2031-06-30");
      expect(late.rows[0].cells.owed).toBe(11n * M);
      expect(late.rows).toHaveLength(3);
      // the copy sent to an Indonesian customer: their words, the same rupiah
      const sent = await customerStatement(viaPg(db), customer, "2031-06-01", "2031-06-30", "id");
      expect(sent.columns.map((c) => c.label)).toEqual([
        "Tanggal",
        "Keterangan",
        "Tagihan",
        "Ditagih",
        "Dibayar/dibatalkan",
        "Sisa",
      ]);
      expect(sent.rows.map((x) => [x.cells.what, x.cells.owed])).toEqual([
        ["Sisa di awal", 3n * M],
        ["Tagihan", 13n * M],
        ["Tagihan", 21n * M],
        ["Tagihan", 26n * M],
        ["Pembayaran", 22n * M],
        ["Pembayaran", 21n * M],
        ["Pembayaran", 11n * M],
        ["Tagihan dibatalkan", 7n * M],
        ["Lunas tanpa transfer", 4n * M],
      ]);
      expect(sent.totals).toMatchObject({ what: "Sisa di akhir", owed: 4n * M });
    });
  });
});

describe("reminder effectiveness (hand-calculated)", () => {
  it("messages sent in the window, and the bills paid in full within 7 days of them", async () => {
    await withRulesOff(async (db) => {
      const customer = (
        await db.query("insert into customers (name) values ('Reminder Test') returning id")
      ).rows[0].id as string;
      const acct = await account(db);
      const operator = await createUser(db, "operator");
      const bill = async (base: bigint) => {
        await db.query("set local role service_role");
        const { rows } = await db.query(
          "select id, transfer_amount from create_invoice($1, $2, '2031-08-01', '2031-08-20')",
          [customer, String(base)],
        );
        await db.query("reset role");
        return rows[0] as { id: string; transfer_amount: string };
      };
      const sent = (invoice: string, kind: string, day: string) =>
        db.query(
          "insert into reminders (invoice_id, channel, scheduled_for, status, sent_at, template_key, amount_shown) values ($1, 'email', ($3 || 'T08:00:00+07')::timestamptz, 'sent', ($3 || 'T08:00:00+07')::timestamptz, $2, 1)",
          [invoice, kind, day],
        );
      const paidQuickly = await bill(2n * M);
      const neverPaid = await bill(3n * M);
      await sent(paidQuickly.id, "reminder", "2031-08-17");
      await sent(neverPaid.id, "reminder", "2031-08-17");
      await sent(neverPaid.id, "overdue", "2031-08-25");
      await sent(paidQuickly.id, "thank_you", "2031-08-20"); // not counted
      await sent(neverPaid.id, "reminder", "2031-07-01"); // before the window
      // the first bill is paid in full 3 days after its reminder
      const { rows } = await db.query(
        `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
         values ($1, $2, '2031-08-20T10:00:00+07', $3, 'in', 'RE') returning id`,
        [acct, `re-${++seq}`, paidQuickly.transfer_amount],
      );
      await actAs(db, operator);
      await db.query("select apply_payment($1, $2, $3)", [
        paidQuickly.id,
        rows[0].id,
        paidQuickly.transfer_amount,
      ]);
      await actAsAdmin(db);

      const { rows: result } = await db.query(
        "select kind, sent, paid_within_7, average_days::text from reminder_effectiveness('2031-08-01', '2031-08-31') order by kind",
      );
      expect(result).toEqual([
        { kind: "overdue", sent: 1, paid_within_7: 0, average_days: null },
        { kind: "reminder", sent: 2, paid_within_7: 1, average_days: "3.0" },
      ]);
    });
  });
});
