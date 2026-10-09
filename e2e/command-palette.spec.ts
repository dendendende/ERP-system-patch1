import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth";

/** Ctrl K, once the page is ready to listen for it. */
async function openPalette(page: Page) {
  const palette = page.getByRole("dialog", { name: "Find or jump to" });
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("Control+k");
    await expect(palette.getByRole("combobox")).toBeFocused({ timeout: 500 });
  }).toPass();
  return palette;
}

// P7-T9: Ctrl/⌘ K opens one box for screens, common actions, and customers, bills and
// transactions; only what the person may open is offered.

test("Ctrl K finds a customer and opens it with the keyboard", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/money");

  const palette = await openPalette(page);
  const box = palette.getByRole("combobox");

  // screens come first; a viewer is not offered what a viewer can't open
  const results = palette.getByRole("listbox");
  await expect(results.getByRole("option", { name: /^Money in & out/ })).toBeVisible();
  await box.fill("record");
  await expect(results.getByRole("option")).toHaveCount(0);

  // a customer, by part of the name; arrows move, Enter opens
  await box.fill("maju jaya");
  const customer = palette
    .getByRole("group", { name: "Customers" })
    .getByRole("option", { name: /PT Maju Jaya/ });
  await expect(customer).toBeVisible();
  await box.press("ArrowDown");
  await box.press("ArrowUp");
  await expect(customer).toHaveAttribute("aria-selected", "true");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  await expect(palette).toBeHidden();

  // the button opens it too, and Esc closes it
  await page
    .getByRole("button", { name: /Find or jump to/ })
    .first()
    .click();
  await expect(box).toBeFocused();
  await box.fill("no such thing zz");
  await expect(palette.getByText(/No customers, bills or transactions match/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("an operator is offered recording money", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/");
  const palette = await openPalette(page);
  await palette.getByRole("combobox").fill("record out");
  await palette.getByRole("combobox").press("Enter");
  await expect(page).toHaveURL(/\/money\/new\?dir=out$/);
});
