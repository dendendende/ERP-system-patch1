import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P7-T10: the keyboard across list and panel — j / k move, Enter opens, j / k step through rows
// with the panel open, Esc closes it and puts focus back on the row; "/" goes to the search box.

test("j / k, Enter and Esc move through the list and the panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "keys are a desktop thing");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/dev/analytical-list");
  const rows = page
    .getByRole("table", { name: "Made-up transactions" })
    .locator("tbody tr[data-row]");
  const link = (n: number) => rows.nth(n).getByRole("link");

  // the first j lands on the first row (pressed again until the page is ready to listen)
  await expect(async () => {
    await page.keyboard.press("j");
    await expect(link(0)).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await expect(link(1)).toBeFocused();

  // Enter opens it beside the list; j opens the next one there
  const second = (await link(1).innerText()).trim();
  const third = (await link(2).innerText()).trim();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: second })).toBeVisible();
  await page.keyboard.press("j");
  const panel = page.getByRole("complementary", { name: third });
  await expect(panel.getByRole("heading", { name: third })).toBeFocused();

  // Esc closes it, and the keyboard is back on that row
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.getByRole("link", { name: third, exact: true })).toBeFocused();

  // held down, far past the rows drawn so far: none is skipped, and the row is in view
  for (let i = 0; i < 60; i++) await page.keyboard.press("j");
  const focused = page.locator("tbody tr[data-row]:has(:focus)");
  await expect(focused).toHaveAttribute("aria-rowindex", String(2 + 2 + 60));
  await expect(focused).toBeInViewport();
});

test("/ goes to the page's search box, or opens the find box", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "keys are a desktop thing");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/money");
  const search = page.getByRole("searchbox", { name: "Search" });
  // the filters stream in after the page: before they're there, "/" opens the find box
  await expect(search).toBeVisible();
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(search).toBeFocused({ timeout: 500 });
  }).toPass();
  // in a field, "/" is just a character
  await page.keyboard.type("a/b");
  await expect(search).toHaveValue("a/b");

  await page.goto("/health");
  const find = page.getByRole("dialog", { name: "Find or jump to" });
  await expect(async () => {
    if (!(await find.isVisible())) await page.keyboard.press("/");
    await expect(find.getByRole("combobox")).toBeFocused({ timeout: 500 });
  }).toPass();
});
