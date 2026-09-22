import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth";

const CUSTOMER = "Toko Berkah";
const amount = () => `3.${String(100 + Math.floor(Math.random() * 800))}.000`;

/** Writes a bill on the customer page; returns its card and number. */
async function writeBill(page: Page, rupiah: string) {
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();
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

  // the first incoming transfer that isn't matched to a bill yet
  for (let i = 0; ; i++) {
    await page.goto("/money?show=in");
    const rows = page.getByRole("region", { name: "Transactions" }).getByRole("link");
    expect(i, "no unmatched transfer to match").toBeLessThan(await rows.count());
    await rows.nth(i).click();
    await page.waitForURL(/\/money\/[0-9a-f-]+/);
    await expect(page.getByRole("heading", { name: "Label" })).toBeVisible();
    if (await page.getByRole("heading", { name: "Which bill did this pay?" }).isVisible()) break;
  }

  await page.getByRole("group", { name: "Bills waiting for money" }).getByText(number).click();
  await page.getByLabel("How much of this transfer?").fill("50.000");
  await page.getByRole("button", { name: "This paid the bill" }).click();
  await expect(page.getByText(`of this transfer paid ${number}`)).toBeVisible();

  // the bill now shows part of it paid
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();
  await expect(billCard(page, number).getByText("Partly paid")).toBeVisible();
  await expect(billCard(page, number).getByText("Rp 50.000")).toBeVisible();
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
