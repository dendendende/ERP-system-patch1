import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("the owner reads last week's summary, ready to copy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/settings");
  await page.getByRole("link", { name: /Weekly summary/ }).click();
  const summary = page.locator("pre");
  await expect(summary).toContainText(/^Week of /);
  await expect(summary).toContainText(/Cash in the bank: Rp/);
  await expect(summary).toContainText(/Came in Rp .+, went out Rp/);
  await expect(page.getByRole("button", { name: "Copy the summary" })).toBeVisible();
});

test("an operator can't open the weekly summary", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/settings/weekly-summary");
  await expect(page).toHaveURL(/\/forbidden/);
});
