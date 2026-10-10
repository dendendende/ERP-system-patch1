import { expect, type Page } from "@playwright/test";

/**
 * A customer's own page, reached the way a person does: the customers list → their row (it opens
 * in the side panel) → "Open as a page". No name: the first customer listed. Returns the name.
 */
export async function openCustomer(page: Page, name?: string) {
  // by name: search for it first — the table only draws the rows on screen
  await page.goto(name ? `/customers?q=${encodeURIComponent(name)}` : "/customers?all=1");
  const rows = page.getByRole("region", { name: "Customers" }).locator("tbody tr[data-row]");
  const link = name
    ? rows.getByRole("link", { name, exact: true })
    : rows.first().getByRole("link").first();
  const shown = (await link.innerText()).trim();
  await link.click();
  await page
    .locator("aside[aria-labelledby]") // the side panel (the sidebar is an aside too)
    .getByRole("link", { name: "Open as a page" })
    .click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  return shown;
}
