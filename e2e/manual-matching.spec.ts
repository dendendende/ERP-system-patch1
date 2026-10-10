import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth";
import { openCustomer } from "./open";

const CUSTOMER = "Toko Berkah";
const amount = () => `3.${String(100 + Math.floor(Math.random() * 800))}.000`;

/** Writes a bill on the customer page; returns its card and number. */
async function writeBill(page: Page, rupiah: string) {
  await openCustomer(page, CUSTOMER);
  await page.getByLabel("Amount (Rp)").fill(rupiah);
  await page.getByRole("button", { name: "Write bill" }).click();
  await expect(page.getByText("Bill written.")).toBeVisible();
  const card = page
    .getByRole("region", { name: "Bills" })
    .locator(".rounded-xl")
    .filter({ hasText: `Rp ${rupiah}` })
    .first();
  return { card, number: (await card.getByText(/^INV-\d+$/).innerText()).trim() };
}

function billCard(page: Page, number: string) {
  return page
    .getByRole("region", { name: "Bills" })
    .locator(".rounded-xl")
    .filter({ hasText: number })
    .first();
}

test("an operator says which bill a transfer paid, but can't mark one paid", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  const { card, number } = await writeBill(page, amount());

  // marking paid without a transfer is the owner's alone
  await card.locator("summary").click();
  await expect(card.getByRole("button", { name: "Mark paid" })).toHaveCount(0);

  // a transfer arrives that the engine can't place by itself (not the exact amount, no number)
  const ref = `HANDMATCH${Date.now()}`;
  await page.goto("/money/import");
  await page.getByLabel("Statement file (CSV)").setInputFiles({
    name: `${ref}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,description,amount\n2026-09-20,"TRSF CR ${ref} ${CUSTOMER.toUpperCase()}",50000\n`,
    ),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  await page.getByRole("button", { name: /^Import \d+ new$/ }).click();
  await expect(page.getByText(/Added \d+ new transactions/)).toBeVisible();

  await page.goto(`/money?q=${ref}`);
  await page
    .getByRole("region", { name: "Transactions" })
    .locator("tbody")
    .getByRole("link")
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Which bill did this pay?" })).toBeVisible();

  await page.getByRole("group", { name: "Bills waiting for money" }).getByText(number).click();
  await page.getByLabel("How much of this transfer?").fill("50.000");
  await page.getByRole("button", { name: "This paid the bill" }).click();
  await expect(page.getByText(`of this transfer paid ${number}`)).toBeVisible();

  // the bill now shows part of it paid
  await openCustomer(page, CUSTOMER);
  await expect(billCard(page, number).getByText("Partly paid")).toBeVisible();
  await expect(billCard(page, number).getByText("Rp 50.000")).toBeVisible();

  // tidy up: cancel the test bill so bills from test runs don't pile up as "waiting"
  const card2 = billCard(page, number);
  await card2.locator("summary").click();
  await card2.getByLabel("Cancel this bill — why?").fill("End of test");
  await card2.getByRole("button", { name: "Cancel bill" }).click();
  await expect(card2.getByText("Cancelled")).toBeVisible();
});

test("the owner marks a bill paid without a transfer, giving a reason", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  const { card, number } = await writeBill(page, amount());

  await card.locator("summary").click();
  await card.getByRole("button", { name: "Mark paid" }).click();
  await expect(card.getByText("Say why this bill counts as paid.")).toBeVisible();

  // a refused save leaves the panel open, with what was typed still in it
  await card.getByLabel("Paid, but not by transfer — how?").fill("Paid cash at the office");
  await card.getByRole("button", { name: "Mark paid" }).click();
  await expect(card.getByText("Marked paid.")).toBeVisible();
  await expect(billCard(page, number).getByRole("img", { name: "100% paid" })).toBeVisible();
});
