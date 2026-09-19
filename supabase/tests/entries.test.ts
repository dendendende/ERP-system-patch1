import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { actAs, actAsAdmin, createUser, tryQuery, withRollback } from "./db";

let seq = 0;

async function account(db: Client) {
  const { rows } = await db.query(
    `insert into bank_accounts (bank_name, account_name, account_last4, source)
     values ('BCA', 'Test', '0003', 'csv') returning id`,
  );
  return rows[0].id as string;
}

/** Inserts a bank transaction and returns its entry. */
async function tx(
  db: Client,
  acc: string,
  direction: "in" | "out",
  description: string,
  amount = 1_000,
) {
  const { rows } = await db.query(
    `insert into bank_transactions (bank_account_id, external_id, occurred_at, amount, direction, description_raw)
     values ($1, $2, now(), $3, $4, $5) returning id`,
    [acc, `t-${++seq}`, amount, direction, description],
  );
  return entryFor(db, rows[0].id);
}

async function entryFor(db: Client, txId: string) {
  const { rows } = await db.query(
    `select e.id, e.status, e.is_recurring, e.rule_id, e.updated_by, c.name as category
       from entries e left join categories c on c.id = e.category_id
      where e.bank_transaction_id = $1`,
    [txId],
  );
  return rows[0];
}

const category = async (db: Client, name: string, type: "in" | "out") =>
  (await db.query("select id from categories where name = $1 and type = $2", [name, type])).rows[0]
    .id as string;

async function rule(
  db: Client,
  r: {
    type?: string;
    pattern: string;
    direction: "in" | "out";
    category: string;
    priority?: number;
    recurring?: boolean;
    active?: boolean;
  },
) {
  const { rows } = await db.query(
    `insert into rules (match_type, pattern, direction, category_id, priority, is_recurring, is_active)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      r.type ?? "contains",
      r.pattern,
      r.direction,
      await category(db, r.category, r.direction),
      r.priority ?? 0,
      r.recurring ?? false,
      r.active ?? true,
    ],
  );
  return rows[0].id as string;
}

describe("entries engine", () => {
  it("every new bank transaction gets exactly one entry; no rule → needs_label", async () => {
    await withRollback(async (db) => {
      const e = await tx(db, await account(db), "out", "SOMETHING NEW");
      expect(e).toMatchObject({ status: "needs_label", category: null });
    });
  });

  it("a matching rule labels it automatically (case-insensitive contains)", async () => {
    await withRollback(async (db) => {
      const r = await rule(db, {
        pattern: "amazon web services",
        direction: "out",
        category: "Servers & hosting",
        recurring: true,
      });
      const e = await tx(db, await account(db), "out", "AMAZON WEB SERVICES AWS.AMAZON.CO");
      expect(e).toMatchObject({
        status: "auto",
        category: "Servers & hosting",
        is_recurring: true,
        rule_id: r,
      });
    });
  });

  it("highest priority wins; on a tie the newest rule wins", async () => {
    await withRollback(async (db) => {
      const acc = await account(db);
      await rule(db, {
        pattern: "TOKO",
        direction: "out",
        category: "Office supplies",
        priority: 1,
      });
      await rule(db, { pattern: "TOKO ATK", direction: "out", category: "Equipment", priority: 5 });
      expect((await tx(db, acc, "out", "QRIS TOKO ATK")).category).toBe("Equipment");

      await db.query("select pg_sleep(0.01)"); // distinct created_at
      await rule(db, { pattern: "TOKO ATK", direction: "out", category: "Marketing", priority: 5 });
      expect((await tx(db, acc, "out", "QRIS TOKO ATK")).category).toBe("Marketing");
    });
  });

  it("rules only match their own direction, and can't point at the wrong kind of category", async () => {
    await withRollback(async (db) => {
      await rule(db, { pattern: "PT MAJU", direction: "in", category: "Subscription income" });
      expect((await tx(db, await account(db), "out", "REFUND PT MAJU")).status).toBe("needs_label");

      const incomeCategory = await category(db, "Subscription income", "in");
      const bad = await tryQuery(
        db,
        "insert into rules (match_type, pattern, direction, category_id) values ('contains', 'x', 'out', $1)",
        [incomeCategory],
      );
      expect(bad.error).toMatch(/foreign key/);
    });
  });

  it("supports equals and regex; rejects an invalid regex when the rule is saved", async () => {
    await withRollback(async (db) => {
      const acc = await account(db);
      await rule(db, {
        type: "equals",
        pattern: "biaya adm",
        direction: "out",
        category: "Bank fees",
      });
      await rule(db, {
        type: "regex",
        pattern: "^TRF KE PAYROLL",
        direction: "out",
        category: "Salary",
      });
      expect((await tx(db, acc, "out", "BIAYA ADM")).category).toBe("Bank fees");
      expect((await tx(db, acc, "out", "BIAYA ADM BULANAN")).status).toBe("needs_label");
      expect((await tx(db, acc, "out", "TRF KE PAYROLL GAJI")).category).toBe("Salary");

      const bad = await tryQuery(
        db,
        "insert into rules (match_type, pattern, direction, category_id) values ('regex', '([unclosed', 'out', $1)",
        [await category(db, "Other", "out")],
      );
      expect(bad.error).toMatch(/not a valid regular expression/);
    });
  });

  it("inactive rules are ignored; deactivating a rule leaves past entries alone", async () => {
    await withRollback(async (db) => {
      const acc = await account(db);
      const r = await rule(db, { pattern: "INDIHOME", direction: "out", category: "Internet" });
      const before = await tx(db, acc, "out", "INDIHOME TELKOM");
      await db.query("update rules set is_active = false where id = $1", [r]);
      expect((await tx(db, acc, "out", "INDIHOME TELKOM")).status).toBe("needs_label");
      expect(
        (
          await entryFor(
            db,
            (await db.query("select bank_transaction_id from entries where id = $1", [before.id]))
              .rows[0].bank_transaction_id,
          )
        ).category,
      ).toBe("Internet");
    });
  });

  it("sync path (sync_bank_batch as service_role) creates entries too", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `insert into bank_accounts (bank_name, account_name, account_last4, source)
         values ('Mandiri', 'T', '0004', 'aggregator') returning id`,
      );
      await rule(db, { pattern: "SEWA", direction: "out", category: "Rent" });
      await db.query("set local role service_role");
      await db.query("select sync_bank_batch($1, $2, now())", [
        rows[0].id,
        JSON.stringify([
          {
            external_id: "s1",
            occurred_at: "2026-09-01T09:00:00+07:00",
            amount: "12000000",
            direction: "out",
            description_raw: "SEWA KANTOR",
            balance_after: null,
          },
        ]),
      ]);
      await db.query("reset role");
      const { rows: e } = await db.query(
        `select c.name from entries e join bank_transactions t on t.id = e.bank_transaction_id
         join categories c on c.id = e.category_id where t.bank_account_id = $1`,
        [rows[0].id],
      );
      expect(e).toEqual([{ name: "Rent" }]);
    });
  });
});

describe("apply_rules_to_unlabelled", () => {
  it("labels waiting entries, never touches labelled ones, and is safe to re-run", async () => {
    await withRollback(async (db) => {
      const acc = await account(db);
      const waiting = await tx(db, acc, "out", "CANVA PRO");
      const manual = await tx(db, acc, "out", "CANVA TEAM");
      const operator = await createUser(db, "operator");

      await actAs(db, operator);
      await db.query("update entries set category_id = $1 where id = $2", [
        await category(db, "Marketing", "out"),
        manual.id,
      ]);
      await actAsAdmin(db);
      await rule(db, { pattern: "CANVA", direction: "out", category: "Software" });

      await actAs(db, operator);
      expect(
        (await db.query("select apply_rules_to_unlabelled() as n")).rows[0].n,
      ).toBeGreaterThanOrEqual(1);
      expect((await db.query("select apply_rules_to_unlabelled() as n")).rows[0].n).toBe(0);
      await actAsAdmin(db);

      const tid = async (entryId: string) =>
        (await db.query("select bank_transaction_id from entries where id = $1", [entryId])).rows[0]
          .bank_transaction_id;
      expect(await entryFor(db, await tid(waiting.id))).toMatchObject({
        status: "auto",
        category: "Software",
      });
      expect(await entryFor(db, await tid(manual.id))).toMatchObject({
        status: "labelled",
        category: "Marketing",
      });
    });
  });

  it("viewers cannot run it", async () => {
    await withRollback(async (db) => {
      await actAs(db, await createUser(db, "viewer"));
      expect((await tryQuery(db, "select apply_rules_to_unlabelled()")).error).toMatch(
        /Not allowed/,
      );
    });
  });
});

describe("entry edits", () => {
  it("a person's relabel is marked labelled, stamped, and audited", async () => {
    await withRollback(async (db) => {
      const e = await tx(db, await account(db), "out", "GRAB FOOD");
      const operator = await createUser(db, "operator");
      await actAs(db, operator);
      await db.query("update entries set category_id = $1, note = 'team lunch' where id = $2", [
        await category(db, "Other", "out"),
        e.id,
      ]);
      await actAsAdmin(db);

      const { rows } = await db.query("select status, updated_by from entries where id = $1", [
        e.id,
      ]);
      expect(rows[0]).toEqual({ status: "labelled", updated_by: operator });
      const { rows: log } = await db.query(
        "select actor_id, new_value from audit_log where record_id = $1 and action = 'update'",
        [e.id],
      );
      expect(log[0].actor_id).toBe(operator);
      expect(log[0].new_value).toMatchObject({ status: "labelled", note: "team lunch" });
    });
  });

  it("rejects a category of the wrong direction", async () => {
    await withRollback(async (db) => {
      const e = await tx(db, await account(db), "out", "X");
      await actAs(db, await createUser(db, "owner"));
      const res = await tryQuery(db, "update entries set category_id = $1 where id = $2", [
        await category(db, "Subscription income", "in"),
        e.id,
      ]);
      expect(res.error).toMatch(/does not match the direction/);
    });
  });

  it("viewers can't edit; nobody can re-point, create or delete entries", async () => {
    await withRollback(async (db) => {
      const acc = await account(db);
      const e = await tx(db, acc, "out", "X");
      const other = await tx(db, acc, "out", "Y");
      await actAs(db, await createUser(db, "viewer"));
      expect(
        (await tryQuery(db, "update entries set note = 'x' where id = $1", [e.id])).rowCount,
      ).toBe(0);

      await actAsAdmin(db);
      await actAs(db, await createUser(db, "owner"));
      const otherTx = (
        await db.query("select bank_transaction_id from entries where id = $1", [other.id])
      ).rows[0].bank_transaction_id;
      expect(
        (
          await tryQuery(db, "update entries set bank_transaction_id = $1 where id = $2", [
            otherTx,
            e.id,
          ])
        ).error,
      ).toMatch(/permission denied/);
      expect((await tryQuery(db, "delete from entries where id = $1", [e.id])).error).toMatch(
        /permission denied/,
      );
      expect(
        (
          await tryQuery(
            db,
            "insert into entries (bank_transaction_id, status) values ($1, 'needs_label')",
            [otherTx],
          )
        ).error,
      ).toMatch(/permission denied/);
    });
  });
});
