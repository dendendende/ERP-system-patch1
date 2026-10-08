import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// Money in & out v2: filter bar + chips, totals, charts that drill down, sortable dense table,
// CSV export that matches the screen.

const amountsIn = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Transactions" }).locator("tbody tr[data-row] td:last-child");

/** True when the list has rows and every amount starts with the sign. */
const allStartWith = async (page: import("@playwright/test").Page, sign: string) => {
  const amounts = await amountsIn(page).allInnerTexts();
  return amounts.length > 0 && amounts.every((a) => a.startsWith(sign));
};

test("filter, chips, totals and the table all agree", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money");
  await expect(
    page.getByRole("table", { name: "Transactions matching the filters" }),
  ).toBeVisible();

  // money out only: every amount is a minus, and it shows as a removable chip
  await page.getByLabel("In or out").selectOption("out");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/dir=out/);
  // the page streams in after the address changes: wait for the rows, not just the address
  await expect.poll(() => allStartWith(page, "−")).toBe(true);
  await expect(page.getByRole("region", { name: "Totals" }).getByText("Came in")).toBeVisible();

  // removing the chip shows everything again
  await page.getByRole("link", { name: "Remove filter: Money out" }).click();
  await expect(page).not.toHaveURL(/dir=/);

  // clicking "Came in" narrows the list to money in
  await page
    .getByRole("region", { name: "Totals" })
    .getByRole("link", { name: /Came in/ })
    .click();
  await expect(page).toHaveURL(/dir=in/);
  await expect.poll(() => allStartWith(page, "+")).toBe(true);

  // sort by amount, biggest first
  await page.getByRole("link", { name: /^Amount/ }).click();
  await expect(page).toHaveURL(/sort=amount_desc/);
  await expect(page.getByRole("columnheader", { name: /Amount ↓/ })).toBeVisible();
  const sorted = (await amountsIn(page).allInnerTexts()).map((a) => Number(a.replace(/\D/g, "")));
  expect(sorted.length).toBeGreaterThan(0);
  expect(sorted).toEqual([...sorted].sort((a, b) => b - a));

  // a search with no hits explains itself
  await page.getByLabel("Search").fill("ZZZ NOTHING");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No transactions match these filters.")).toBeVisible();
});

test("a month in the chart narrows the list to that month; the CSV matches the screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money");

  const month = page
    .getByRole("region", { name: "Charts" })
    .getByRole("link", { name: /Show only .* \d{4}\.$/ })
    .first();
  await month.click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole("link", { name: /^Remove filter: \d{4}-\d{2}-01 to/ })).toBeVisible();

  const shown = Number(
    (
      await page.getByRole("region", { name: "Totals" }).locator("span.text-lg").first().innerText()
    ).replace(/\D/g, ""),
  );
  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const body = await res.body();
  // starts with the byte-order mark Excel needs to read it as UTF-8
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = body.subarray(3).toString("utf8").trim().split("\r\n");
  expect(lines[0]).toBe(
    "Date,Description,Account,In/Out,Amount (Rp),Category,Status,Bill,Who,Note,Came from",
  );
  expect(lines.length - 1).toBe(shown);
});

test("paging keeps the current filter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money?dir=in");
  const next = page.getByRole("link", { name: "Next →" });
  if (await next.isVisible()) {
    await next.click();
    await expect(page).toHaveURL(/dir=in.*page=2/);
    await expect(page.getByText(/page 2 of/)).toBeVisible();
  }
});

test("adding money — typed in or imported — is one obvious button away, for those who may", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/money?all=1");
  await expect(page.getByRole("heading", { level: 1, name: "Money in & out" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add money in or out" })).toHaveCount(0);

  const theirs = await browser.newContext();
  const operator = await theirs.newPage();
  await signIn(operator, "e2e-operator@example.test");
  await operator.goto("/money?all=1");
  await operator.getByRole("link", { name: "Add money in or out" }).click();
  await expect(operator).toHaveURL(/\/money\/new$/);
  const ways = operator.getByRole("navigation", { name: "How to add it" });
  await expect(ways.getByRole("link", { name: "Type it in" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await ways.getByRole("link", { name: "Import a bank statement" }).click();
  await expect(operator).toHaveURL(/\/money\/import$/);
  await expect(operator.getByLabel("Statement file (CSV)")).toBeVisible();
  await theirs.close();
});
