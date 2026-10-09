import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

/** The customer with no subscription, so this test never disturbs the billing demo data. */
const CUSTOMER = "Toko Berkah";

test("an operator writes a bill, changes it, and cancels it", async ({ page }, testInfo) => {
  // a different amount every run, so a bill from an earlier run is never mistaken for this one
  const amount = `2.${String(300 + Math.floor(Math.random() * 600))}.000`;
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();

  const bills = page.getByRole("region", { name: "Bills" });

  await page.getByLabel("Amount (Rp)").fill(amount);
  await page.getByRole("button", { name: "Write bill" }).click();
  await expect(page.getByText("Bill written.")).toBeVisible();

  // the bill asks for the amount plus the few digits that identify it
  const newest = bills
    .locator(".rounded-xl")
    .filter({ hasText: `Rp ${amount}` })
    .first();
  await expect(newest).toContainText(`Rp ${amount}`);
  await expect(newest).toContainText(
    new RegExp(
      `Ask them to transfer exactly Rp ${amount.replace(/\./g, "\\.").slice(0, -2)}\\d\\d`,
    ),
  );

  // an amount that isn't whole rupiah is refused, in plain words
  await page.getByLabel("Amount (Rp)").fill("2,5");
  await page.getByRole("button", { name: "Write bill" }).click();
  await expect(page.getByText("Write the amount in rupiah, for example 1.500.000.")).toBeVisible();

  // change what may be changed
  await newest.locator("summary").click();
  await newest.getByLabel("Note").fill("Agreed by phone");
  await newest.getByRole("button", { name: "Save" }).click();
  await expect(newest.getByText("Saved.")).toBeVisible();
  await expect(newest.locator("details[open]")).toHaveCount(0);

  // cancelling needs a reason
  await newest.locator("summary").click();
  await newest.getByRole("button", { name: "Cancel bill" }).click();
  await expect(newest.getByText("Say why this bill is being cancelled.")).toBeVisible();
  await newest.getByLabel("Cancel this bill — why?").fill("Wrong amount");
  await newest.getByRole("button", { name: "Cancel bill" }).click();
  // the bill now reads Cancelled, and has nothing left to change
  await expect(newest.getByText("Cancelled")).toBeVisible();
  await expect(newest.locator("summary")).toHaveCount(0);
});

test("a viewer can read the bills but not write one", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();

  await expect(page.getByRole("region", { name: "Bills" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write bill" })).toHaveCount(0);
  await expect(page.locator("summary")).toHaveCount(0);
});
