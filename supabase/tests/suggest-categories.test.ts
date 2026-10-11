import { describe, expect, it } from "vitest";
import { actAs, createUser, withRulesOff } from "./db";

// P9-T7: suggest_categories finds each category's most similar description through a trigram
// index. It must still give exactly what comparing with every labelled row gives (the P1-T8
// rule, written out below), whatever is in the database — the 50,000 perf rows included.
const everyRow = `
  with history as (
    select e.category_id,
           max(extensions.similarity(t.description_raw, $2)) as similarity,
           count(*) as uses
      from entries e
      join bank_transactions t on t.id = e.bank_transaction_id
      join categories c on c.id = e.category_id
     where e.status in ('labelled', 'auto') and c.type = $1
     group by e.category_id
  ),
  scored as (
    select h.category_id, (h.similarity + least(h.uses, 10)::real / 100)::real as score
      from history h
    union all
    select c.id, 0::real from categories c
     where c.type = $1 and c.is_system and c.report_group <> 'transfer'
  )
  select c.name, max(s.score)::real as score
    from scored s join categories c on c.id = s.category_id
   group by s.category_id, c.name
   order by score desc, c.name
   limit 3`;

describe("category suggestions", () => {
  it("match comparing with every labelled row, and put the look-alike first", async () => {
    await withRulesOff(async (db) => {
      const { rows: acc } = await db.query(
        `insert into bank_accounts (bank_name, account_name, account_last4, source)
         values ('BCA', 'Test', '0004', 'csv') returning id`,
      );
      // one labelled payment to a payee nobody else has
      const { rows: tx } = await db.query(
        `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
         values ($1, 'suggest-1', now(), 5000, 'out', 'TRSF DB QWZX FJORDVAULT HOSTING') returning id`,
        [acc[0].id],
      );
      await db.query(
        `update entries set status = 'labelled',
                category_id = (select id from categories where name = 'Servers & hosting')
          where bank_transaction_id = $1`,
        [tx[0].id],
      );
      const owner = await createUser(db, "owner");
      await actAs(db, owner);

      const asked: [string, string][] = [
        ["out", "TRSF DB QWZX FJORDVAULT HOSTING OCT"],
        ["out", "something nobody wrote"],
        ["in", "TRSF CR TOKO BERKAH"],
        ["in", ""],
      ];
      for (const [direction, description] of asked) {
        const { rows: got } = await db.query("select name, score from suggest_categories($1, $2)", [
          direction,
          description,
        ]);
        const { rows: want } = await db.query(everyRow, [direction, description]);
        expect(got, `${direction}: ${description}`).toEqual(want);
      }
      const { rows: first } = await db.query(
        "select name from suggest_categories('out', 'TRSF DB QWZX FJORDVAULT HOSTING OCT')",
      );
      expect(first[0].name).toBe("Servers & hosting");
    });
  });
});
