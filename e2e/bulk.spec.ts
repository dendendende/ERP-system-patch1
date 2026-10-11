import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

// P9-T4: bulk actions on ticked rows — label, remind, cancel. Each test makes its own rows as the
// e2e operator (the e2e clean-up removes them: hand entries go, bills are cancelled, and the
// reminders for "E2E Flow" customers close), so the seeded data never changes.

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";
const OPERATOR = "e2e-operator@example.test";
const RUN = Array.from(
  { length: 6 },
  () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)],
).join("");

/** Run SQL as a signed-in e2e user, the way the app's requests do (their rights, RLS). */
async function asUser<T>(email: string, fn: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query("begin");
    const { rows } = await db.query("select id from auth.users where email = $1", [email]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: rows[0].id, role: "authenticated", aal: "aal2" }),
    ]);
    await db.query("set local role authenticated");
    const result = await fn(db);
    await db.query("commit");
    return result;
  } finally {
    await db.end();
  }
}

test("label ticked transactions together; one going the other way is left, and says why", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const category = await asUser(OPERATOR, async (db) => {
    const acct = (await db.query("select id from bank_accounts where is_active limit 1")).rows[0]
      .id;
    for (const [direction, amount] of [
      ["out", 101_000],
      ["out", 102_000],
      ["in", 103_000],
    ] as const)
      await db.query(
        "select record_by_hand(gen_random_uuid(), $1, '2020-01-16', $2, $3, $4, 'bulk')",
        [acct, direction, amount, `E2E BULK ${RUN}`],
      );
    return (
      await db.query(
        "select name from categories where type = 'out' and report_group <> 'transfer' and name <> 'Cancelled (entered by mistake)' order by name limit 1",
      )
    ).rows[0].name as string;
  });

  await signIn(page, OPERATOR);
  await page.goto(`/money?q=${encodeURIComponent(`E2E BULK ${RUN}`)}`);
  const list = page.getByRole("region", { name: "Transactions" });
  await expect(list.locator("tbody tr[data-row]")).toHaveCount(3);
  await list.getByRole("checkbox", { name: "Tick all" }).check();
  const bar = page.getByRole("region", { name: "Ticked rows" });
  await expect(bar.getByText("3 ticked")).toBeVisible();
  await bar.getByLabel("Label as").selectOption({ label: category });
  await bar.getByRole("button", { name: "Label" }).click();

  await expect(page.getByRole("status").filter({ hasText: "labelled" })).toHaveText(
    "2 transactions labelled. 1 not: it went the other way (money in vs money out).",
  );
  await expect(bar).toHaveCount(0); // unticked
  await expect(list.getByText(category)).toHaveCount(2);
});

test("remind about ticked bills, then cancel them with a reason", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const customer = `E2E Flow bulk ${RUN}`;
  await asUser(OPERATOR, async (db) => {
    const id = (
      await db.query(
        "insert into customers (name, billing_email) values ($1, 'ap@bulk.example') returning id",
        [customer],
      )
    ).rows[0].id;
    for (const amount of [1_100_000, 1_200_000])
      await db.query("select create_invoice($1, $2, jakarta_today(), jakarta_today() + 14)", [
        id,
        amount,
      ]);
  });

  await signIn(page, OPERATOR);
  await page.goto(`/customers/bills?q=${encodeURIComponent(customer)}`);
  const list = page.getByRole("region", { name: "Bills" });
  await expect(list.locator("tbody tr[data-row]")).toHaveCount(2);
  const bar = page.getByRole("region", { name: "Ticked rows" });
  const said = page.getByRole("status").filter({ hasText: /reminder|cancelled/ });

  await list.getByRole("checkbox", { name: "Tick all" }).check();
  await bar.getByRole("button", { name: "Send a reminder" }).click();
  await expect(said).toHaveText('2 reminders are on "Reminders to send" on Home.');

  // asking again the same day: nothing doubled, and it says so
  await list.getByRole("checkbox", { name: "Tick all" }).check();
  await bar.getByRole("button", { name: "Send a reminder" }).click();
  await expect(said).toHaveText(
    "Nothing was changed. 2 not: a reminder for it already went out today.",
  );

  await list.getByRole("checkbox", { name: "Tick all" }).check();
  await bar.getByRole("button", { name: "Cancel bills…" }).click();
  await bar.getByLabel("Why cancel them?").fill("E2E duplicate bills");
  await bar.getByRole("button", { name: "Cancel 2 bills" }).click();
  await expect(said).toHaveText("2 bills cancelled.");
  await expect(list.getByText("Cancelled", { exact: true })).toHaveCount(2);
});

test("remind ticked customers about what they owe; a viewer gets no tick boxes", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const customer = `E2E Flow remind ${RUN}`;
  await asUser(OPERATOR, async (db) => {
    const id = (
      await db.query(
        "insert into customers (name, billing_email) values ($1, 'ap@remind.example') returning id",
        [customer],
      )
    ).rows[0].id;
    await db.query("select create_invoice($1, 1300000, jakarta_today(), jakarta_today() + 14)", [
      id,
    ]);
  });

  await signIn(page, OPERATOR);
  await page.goto(`/customers?q=${encodeURIComponent(customer)}`);
  const list = page.getByRole("region", { name: "Customers" });
  await expect(list.locator("tbody tr[data-row]")).toHaveCount(1);
  await list.getByRole("checkbox", { name: "Tick this row" }).check();
  await page
    .getByRole("region", { name: "Ticked rows" })
    .getByRole("button", { name: "Remind about what they owe" })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "reminder" })).toHaveText(
    '1 reminder is on "Reminders to send" on Home.',
  );

  const viewer = await browser.newPage();
  await signIn(viewer, "e2e-viewer@example.test");
  for (const path of ["/customers?all=1", "/customers/bills?all=1", "/money"]) {
    await viewer.goto(path);
    await expect(viewer.locator("tbody tr[data-row]").first()).toBeVisible();
    await expect(viewer.getByRole("checkbox", { name: "Tick all" })).toHaveCount(0);
  }
  await viewer.close();
});
