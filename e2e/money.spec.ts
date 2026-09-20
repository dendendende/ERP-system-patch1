import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("money in & out lists transactions and filters them", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money");

  const list = page.getByRole("region", { name: "Transactions" });
  const rows = list.locator(".tabular-nums").filter({ hasText: "Rp" });
  // the radios are visually hidden behind their pill labels, so click the label
  const tab = (name: string) =>
    page.getByRole("group", { name: "Show" }).getByText(name, { exact: true });
  await expect(rows.first()).toBeVisible();
  const heading = page.getByText(/\d+ transactions/);
  await expect(heading).toBeVisible();

  // Money in: every amount on the page is a plus
  await tab("Money in").click();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/show=in/);
  const amounts = await rows.allInnerTexts();
  expect(amounts.length).toBeGreaterThan(0);
  expect(amounts.every((a) => a.startsWith("+"))).toBe(true);

  // Money out: every amount is a minus
  await tab("Money out").click();
  await page.getByRole("button", { name: "Show" }).click();
  expect((await rows.allInnerTexts()).every((a) => a.startsWith("−"))).toBe(true);

  // Search narrows the list; a search with no hits explains itself
  await tab("All").click();
  await page.getByLabel("Search").fill("BIAYA ADM");
  await page.getByRole("button", { name: "Show" }).click();
  for (const text of await list.locator(".truncate.font-medium").allInnerTexts()) {
    expect(text).toContain("BIAYA ADM");
  }

  await page.getByLabel("Search").fill("ZZZ NOTHING");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("Nothing to show")).toBeVisible();
});

test("paging keeps the current filter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money?show=out");
  const older = page.getByRole("link", { name: "Older →" });
  if (await older.isVisible()) {
    await older.click();
    await expect(page).toHaveURL(/show=out.*page=2/);
    await expect(page.getByText(/page 2 of/)).toBeVisible();
  }
});
