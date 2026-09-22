import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Cashflow/);
});
