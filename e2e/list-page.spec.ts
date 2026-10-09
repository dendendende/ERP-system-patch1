import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P7-T6: the list floorplan. A row opens beside the list (or over it on a phone); the list keeps
// its place; the address says what's open; Esc and × close it.

test("a row opens in the side panel without losing the place in the list", async ({ page }) => {
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/dev/analytical-list");
  const table = page.getByRole("table", { name: "Made-up transactions" });
  await expect(table).toBeVisible();

  // further down the list, open a row
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForFunction(() => window.scrollY === 1500);
  const row = table.locator("tbody tr[data-row]").nth(25);
  const name = (await row.getByRole("link").innerText()).trim();
  await row.getByRole("link").click();

  await expect(page).toHaveURL(/\?open=t\d+$/);
  const panel = page.getByRole("complementary", { name });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("In or out")).toBeVisible();
  await expect(table.locator('tr[aria-current="true"]')).toContainText(name);
  // focus moved into the panel, and nothing scrolled
  await expect(panel.getByRole("heading", { name })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(1500);

  // Esc closes it and keeps the list where it was
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/dev\/analytical-list$/);
  await expect(page.getByRole("complementary")).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(1500);
});

test("filters stay when a row opens and closes; a chart bar narrows the list", async ({ page }) => {
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/dev/analytical-list?dir=out");
  await page
    .getByRole("region", { name: "Charts" })
    .getByRole("link", { name: /^Rent:/ })
    .click();
  await expect(page).toHaveURL(/dir=out&category=Rent$/);

  const table = page.getByRole("table", { name: "Made-up transactions" });
  await table.locator("tbody tr[data-row]").first().getByRole("link").click();
  await expect(page).toHaveURL(/dir=out&category=Rent&open=t\d+$/);
  await page.getByRole("link", { name: "Close the panel" }).click();
  await expect(page).toHaveURL(/dir=out&category=Rent$/);
  await expect(page.getByRole("complementary")).toHaveCount(0);
});
