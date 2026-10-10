import { expect, type Page, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";
import { openCustomer } from "./open";

// P6-T5 "done when": the whole money path in one go, the way the team uses it.
//   sign in → label a transfer → write a bill → the customer pays it → reminders stop.
// Bank rows can never be deleted, so each run uses its own names and amount; it leaves one
// labelled transfer, one customer, one paid bill and its payment behind in the dev database.

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";
const RUN = Array.from(
  { length: 6 },
  () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)],
).join("");
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

async function importStatement(page: Page, rows: string) {
  await page.goto("/money/import");
  await page.getByLabel("Statement file (CSV)").setInputFiles({
    name: `flow-${RUN}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(`date,description,amount\n${rows}`),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  await page.getByRole("button", { name: /^Import \d+ new$/ }).click();
  await expect(page.getByText(/Added \d+ new transactions/)).toBeVisible();
}

test("sign in → label → bill → payment matched → reminders cancelled", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  test.setTimeout(90_000);

  // 1. sign in (password + 2FA code)
  await signIn(page, "e2e-operator@example.test");

  // 2. a transfer nobody has labelled arrives; find it and label it
  const payee = `CV FLOWTEST ${RUN}`;
  await importStatement(page, `${TODAY},"TRSF E-BANKING DB ${payee}",-250000\n`);
  const search = `/money?q=${encodeURIComponent(payee)}`;
  const list = page.getByRole("region", { name: "Transactions" });
  await page.goto(search);
  await expect(list.getByText("Needs label")).toBeVisible();
  await list.getByRole("link", { name: new RegExp(payee) }).click();
  await page.getByLabel("What was this for?").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save" }).click();
  const history = page.getByRole("region", { name: "Change history" });
  await expect(history.getByText("E2E Operator").first()).toBeVisible();
  await page.goto(search);
  await expect(list.getByText("Needs label")).toHaveCount(0);

  // 3. a new customer and a bill for them
  const customer = `E2E Flow ${RUN}`;
  await page.goto("/customers");
  await page.getByText("Add a customer").click();
  await page.locator("details", { hasText: "Add a customer" }).getByLabel("Name").fill(customer);
  await page.getByLabel("Billing email").fill(`flow-${RUN.toLowerCase()}@example.test`);
  await page.getByRole("button", { name: "Add and set up what they pay" }).click();
  await expect(page.getByRole("heading", { name: customer })).toBeVisible();

  await page.getByLabel("Amount (Rp)").fill("3.000.000");
  await page.getByRole("button", { name: "Write bill" }).click();
  await expect(page.getByText("Bill written.")).toBeVisible();
  const bills = page.getByRole("region", { name: "Bills" });
  const newBill = bills
    .locator(".rounded-xl")
    .filter({ hasText: "Ask them to transfer exactly" })
    .first();
  const number = (await newBill.getByText(/^INV-\d+$/).innerText()).trim();
  const ask = await newBill.getByText(/Ask them to transfer exactly Rp [\d.]+/).innerText();
  const transfer = ask.match(/Rp ([\d.]+)/)![1].replace(/\./g, "");
  const bill = bills.locator(".rounded-xl").filter({ hasText: number });

  // the bill's own message is queued for the team to send
  const reminders = page.getByRole("region", { name: "What we've sent them" });
  await expect(reminders.getByText(`The bill · ${number}`)).toBeVisible();

  // 4. the customer pays exactly the asked amount; the bank statement comes in; it's matched
  await importStatement(
    page,
    `${TODAY},"TRSF E-BANKING CR ${customer.toUpperCase()}",${transfer}\n`,
  );
  await openCustomer(page, customer);
  await expect(bill.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("All paid up.")).toBeVisible();
  await expect(reminders.getByText(/matched by the app/)).toBeVisible();

  // 5. the bill's reminder is not sent because it was paid; a thank-you is due instead
  const billReminder = reminders.getByRole("listitem").filter({ hasText: `The bill · ${number}` });
  await expect(billReminder).toContainText("The bill was paid");
  await expect(billReminder).toContainText("Not sent");
  await expect(reminders.getByText(`Thank you for paying · ${number}`)).toBeVisible();
  // reminders not due yet leave the timeline, so check every one in the records too
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `select r.status, r.error, r.template_key from reminders r
         join invoices i on i.id = r.invoice_id join customers c on c.id = i.customer_id
        where c.name = $1 and r.template_key is distinct from 'thank_you'`,
      [customer],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows)
      expect(r).toMatchObject({ status: "cancelled", error: "The bill was paid" });
  } finally {
    await db.end();
  }
});
