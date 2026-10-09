import { describe, expect, it } from "vitest";
import { type Limit, type Spent, spendByCategory, spendSplit } from "../../src/lib/metrics";
import { withRulesOff } from "./db";

const M = 1_000_000;
const LIMITS: Limit[] = [
  { signal: "spend_jump", healthy_limit: 30, warning_limit: 60, direction: "lower_is_better" },
];

let seq = 0;

describe("spending on a fixed dataset (hand-calculated)", () => {
  it("by category vs the usual month, regular vs one-off, top payees — as of 15 July 2031", async () => {
    await withRulesOff(async (db) => {
      await db.query("update bank_accounts set is_active = false"); // only this test's accounts
      const account = async (active: boolean) =>
        (
          await db.query(
            "insert into bank_accounts (bank_name, account_name, account_last4, source, is_active) values ('SP', 'T', '0020', 'csv', $1) returning id",
            [active],
          )
        ).rows[0].id as string;
      const acct = await account(true);
      const off = await account(false);
      const category = async (name: string) =>
        (
          await db.query(
            "insert into categories (name, type, report_group) values ($1, 'out', 'costs') returning id",
            [name],
          )
        ).rows[0].id as string;
      const rent = await category("Test rent");
      const ads = await category("Test ads");
      const software = await category("Test software");
      const transfer = (
        await db.query(
          "select id from categories where report_group = 'transfer' and type = 'out' limit 1",
        )
      ).rows[0].id as string;

      const out = async (
        day: string,
        amount: number,
        o: {
          category?: string;
          recurring?: boolean;
          who?: string;
          text?: string;
          account?: string;
        } = {},
      ) => {
        const { rows } = await db.query(
          `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
           values ($1, $2, ($3 || 'T10:00:00+07')::timestamptz, $4, 'out', $5) returning id`,
          [o.account ?? acct, `sp-${++seq}`, day, Math.round(amount * M), o.text ?? "TRSF"],
        );
        await db.query(
          "update entries set category_id = $2, is_recurring = $3, counterparty = $4, status = case when $2::uuid is null then status else 'labelled' end where bank_transaction_id = $1",
          [rows[0].id, o.category ?? null, o.recurring ?? false, o.who ?? ""],
        );
      };

      // rent, regular: 10 a month (March is before the 3 months)
      for (const d of ["2031-03-01", "2031-04-01", "2031-05-01", "2031-06-01", "2031-07-01"])
        await out(d, 10, { category: rent, recurring: true, text: "SEWA KANTOR" });
      // ads, one-off: 2 + 4 + 0 = 6 over three months (usual 2); July 4 + 1 = 5
      await out("2031-04-12", 2, { category: ads });
      await out("2031-05-12", 4, { category: ads });
      await out("2031-07-03", 4, { category: ads, who: "Meta" });
      await out("2031-07-10", 1, { category: ads, who: "Meta" });
      await out("2031-07-20", 7, { category: ads, who: "Meta" }); // after "today"
      // software, regular: 3 a month, then 3.9 — exactly 30% above usual
      for (const d of ["2031-04-05", "2031-05-05", "2031-06-05"])
        await out(d, 3, { category: software, recurring: true });
      await out("2031-07-05", 3.9, { category: software, recurring: true, text: "ATLASSIAN" });
      // not labelled yet, nothing usual to compare with
      await out("2031-07-12", 1, { text: "TRSF BIAYA ADMIN" });
      // never counted: our own transfer, a switched-off account
      await out("2031-07-08", 50, { category: transfer });
      await out("2031-07-08", 99, { category: rent, account: off });

      const { rows } = await db.query("select * from spending_summary('2031-07-15')");
      const spent: Spent[] = rows.map((r) => ({
        ...r,
        this_month: BigInt(r.this_month),
        last_3_months: BigInt(r.last_3_months),
      }));

      const month = "from=2031-07-01&to=2031-07-15";
      expect(spendByCategory(spent, LIMITS, "2031-07-15")).toEqual([
        // 10 vs a usual 10: as usual
        {
          category: "Test rent",
          thisMonth: BigInt(10 * M),
          usual: BigInt(10 * M),
          change: 0,
          status: "healthy",
          flagged: false,
          href: `/money?dir=out&category=${rent}&${month}`,
        },
        // 5 vs a usual 2 (6 ÷ 3): 150% above → flagged
        {
          category: "Test ads",
          thisMonth: BigInt(5 * M),
          usual: BigInt(2 * M),
          change: 150,
          status: "danger",
          flagged: true,
          href: `/money?dir=out&category=${ads}&${month}`,
        },
        // 3.9 vs 3: 30% — at the owner's limit counts
        {
          category: "Test software",
          thisMonth: BigInt(3.9 * M),
          usual: BigInt(3 * M),
          change: 30,
          status: "warning",
          flagged: true,
          href: `/money?dir=out&category=${software}&${month}`,
        },
        {
          category: "Needs a label",
          thisMonth: BigInt(1 * M),
          usual: 0n,
          change: null,
          status: null,
          flagged: false,
          href: `/money?dir=out&status=needs_label&${month}`,
        },
      ]);

      expect(spendSplit(spent, "2031-07-15")).toEqual({
        // rent 10 + software 3.9 = 13.9; 3 months 30 + 9 = 39 → usual 13, 6.9% above
        recurring: {
          thisMonth: BigInt(13.9 * M),
          usual: BigInt(13 * M),
          change: 6.9,
          href: `/money?dir=out&status=recurring&${month}`,
        },
        // ads 5 + unlabelled 1 = 6; 3 months 6 → usual 2, 200% above
        oneOff: {
          thisMonth: BigInt(6 * M),
          usual: BigInt(2 * M),
          change: 200,
          href: `/money?dir=out&${month}`,
        },
      });

      const payees = await db.query(
        "select payee, named, total::text, payments from top_payees('2031-07-15')",
      );
      expect(payees.rows).toEqual([
        { payee: "SEWA KANTOR", named: false, total: String(10 * M), payments: 1 },
        { payee: "Meta", named: true, total: String(5 * M), payments: 2 },
        { payee: "ATLASSIAN", named: false, total: String(3.9 * M), payments: 1 },
        { payee: "TRSF BIAYA ADMIN", named: false, total: String(1 * M), payments: 1 },
      ]);
    });
  });
});
