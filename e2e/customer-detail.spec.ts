import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("a customer's page shows their bill, what is paid, and the amount to transfer", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/customers");
  const first = page.getByRole("region", { name: "Customers" }).getByRole("link").first();
  const name = (await first.innerText()).trim();
  await first.click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  // the headline is one plain sentence about where they stand
  await expect(page.getByText(/All paid up|Waiting for|Paid part of their bill|is late/)).toBeVisible();

  const bills = page.getByRole("region", { name: "Bills" });
  await expect(bills.getByText(/INV-\d+/).first()).toBeVisible();
  for (const label of ["Bill", "Paid", "Still owed"]) {
    await expect(bills.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(bills.getByText("Ask them to transfer exactly").first()).toBeVisible();

  await expect(page.getByRole("region", { name: "Subscription" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reminders" })).toContainText("Coming soon");
});
