import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P7-T4: the list table with 50,000 rows (/dev/data-table): scrolls at 60fps, sorts, ticks,
// hides columns, downloads what's shown.

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the table");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/dev/data-table");
  await expect(page.getByRole("table", { name: "Made-up transactions" })).toBeVisible();
});

const rowsInPage = (page: import("@playwright/test").Page) => page.locator("tbody tr[data-row]");

test("50,000 rows scroll top to bottom at 60fps, with only the visible ones in the page", async ({
  page,
}) => {
  expect(await rowsInPage(page).count()).toBeLessThan(100);

  // worst case: every frame jumps ~11,000px, so each one paints a completely new set of rows
  const frames = await page.evaluate(async () => {
    const deltas: number[] = [];
    const bottom = document.documentElement.scrollHeight - innerHeight;
    let last = performance.now();
    for (let i = 1; i <= 180; i++) {
      window.scrollTo(0, (bottom * i) / 180);
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      deltas.push(now - last);
      last = now;
    }
    return deltas.sort((a, b) => a - b);
  });
  const median = frames[Math.floor(frames.length / 2)];
  const p95 = frames[Math.floor(frames.length * 0.95)];
  console.log(`data table: median frame ${median.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms`);
  expect(median).toBeLessThan(1000 / 60 + 1.5); // 60fps
  expect(p95).toBeLessThan(1000 / 30); // never worse than 30fps

  // at the bottom: the last row is there, and still only a window of rows is in the page
  await expect(page.locator('tbody tr[aria-rowindex="50001"]')).toBeVisible();
  expect(await rowsInPage(page).count()).toBeLessThan(100);
});

test("sorting 50,000 rows by amount puts the biggest first", async ({ page }) => {
  const amount = page.getByRole("button", { name: /^Amount/ });
  await amount.click();
  await expect(page.getByRole("columnheader", { name: "Amount ↓" })).toBeVisible();
  const first = await rowsInPage(page).first().locator("td").last().innerText();
  // the biggest money in of the made-up set
  expect(first).toMatch(/^\+Rp/);
  await amount.click();
  await expect(page.getByRole("columnheader", { name: "Amount ↑" })).toBeVisible();
  await expect(rowsInPage(page).first().locator("td").last()).toHaveText(/^−Rp/);
});

test("ticking rows brings up the action bar; tick all covers all 50,000", async ({ page }) => {
  await rowsInPage(page).nth(0).getByRole("checkbox").check();
  await rowsInPage(page).nth(1).getByRole("checkbox").check();
  const bar = page.getByRole("region", { name: "Ticked rows" });
  await expect(bar).toContainText("2 ticked");
  await page.getByRole("checkbox", { name: "Tick all" }).check();
  await expect(bar).toContainText("50.000 ticked");
  await bar.getByRole("button", { name: "Untick all" }).click();
  await expect(bar).toBeHidden();
});

test("a switched-off column stays off after reload; the CSV has what's shown", async ({ page }) => {
  const table = page.getByRole("table", { name: "Made-up transactions" });
  await page.getByText("Columns", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Category" }).uncheck();
  await expect(table.getByRole("columnheader", { name: "Category" })).toBeHidden();
  await page.reload();
  await expect(table.getByRole("columnheader", { name: "Amount" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Category" })).toBeHidden();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download CSV" }).click(),
  ]);
  const lines = (await (await download.createReadStream()).toArray()).join("").split("\r\n");
  expect(lines[0]).toBe("﻿Date,Description,Amount");
  expect(lines.filter(Boolean)).toHaveLength(50_001);
});
