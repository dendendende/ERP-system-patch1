import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("Home says where the money stands at a glance", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/");

  await expect(page.getByText(/^You have Rp .+ in the bank/)).toBeVisible();
  // the viewer gets the owner's cues, without the ones that open owner-only pages
  const cues = page.getByRole("region", { name: "Your numbers" });
  for (const label of ["Cash in the bank", "Still owed to you", "Subscriptions a month"]) {
    await expect(cues.getByText(label)).toBeVisible();
  }
  await expect(cues.getByText("Marked paid by hand")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Add money" })).toHaveCount(0); // read-only
  const chart = page.getByRole("region", { name: "Money in and out" });
  // each month is a link that says its numbers, and opens that month's money
  await expect(chart.getByRole("link", { name: /: came in Rp .*, went out Rp / })).toHaveCount(6);
  await expect(chart.locator("p", { hasText: /months|pattern/ })).toBeVisible(); // the trend
});

test("the health pill leads to Business health", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/");
  // the pill sits in the headline: wait for it, or counting finds nothing yet
  await expect(page.getByText(/^You have Rp .+ in the bank/)).toBeVisible();
  const pill = page.getByRole("link", {
    name: /^(Business looks healthy|Something needs watching|Something needs attention)$/,
  });
  test.skip((await pill.count()) === 0, "no health snapshot taken yet in this database");
  await pill.click();
  await expect(page).toHaveURL(/\/health$/);
});

test("Business health asks five questions, worst first", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/health");
  await expect(page.getByRole("heading", { level: 1, name: "Business health" })).toBeVisible();
  const questions = page.getByRole("heading", { level: 2 });
  test.skip((await questions.count()) === 0, "no health snapshot taken yet in this database");
  await expect(questions).toHaveCount(5);
  // worst first: once a card says Healthy, no later card is worse
  const pills = await page
    .getByText(/^(Needs attention|Keep an eye on it|Healthy)$/)
    .allInnerTexts();
  const rank = { "Needs attention": 2, "Keep an eye on it": 1, Healthy: 0 } as Record<
    string,
    number
  >;
  expect(pills.map((p) => rank[p])).toEqual([...pills.map((p) => rank[p])].sort((a, b) => b - a));
});

test("every number on Home opens the list behind it, already filtered", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  const cues = page.getByRole("region", { name: "Your numbers" });
  for (const [cue, url] of [
    [/^Cash in the bank: Rp/, /\/settings\/bank$/],
    [/^Lowest point, next 90 days: Rp/, /\/forecast$/],
    [/^Left over this month: Rp/, /\/money\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/],
    [/^Cash lasts:/, /\/money\?dir=out&status=recurring&from=/],
    [/^Owed that is past due:/, /\/customers\/bills\?status=late$/],
    [/^Subscriptions a month: Rp/, /\/customers\?show=active$/],
  ] as const) {
    await page.goto("/");
    await cues.getByRole("link", { name: cue }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  // the headline's amount opens the bank accounts
  await page.goto("/");
  await page
    .getByText(/^You have Rp .+ in the bank/)
    .getByRole("link", { name: /^Rp / })
    .click();
  await expect(page).toHaveURL(/\/settings\/bank$/);
  // a bill number or amount in the day's work opens that bill
  await page.goto("/");
  await expect(page.getByText(/^You have Rp .+ in the bank/)).toBeVisible();
  const work = page
    .getByRole("region", { name: /^(Reminders to send|Call these customers|Today)$/ })
    .getByRole("link", { name: /^(INV-|Rp )/ });
  test.skip((await work.count()) === 0, "no bills in the day's work in this database");
  await work.first().click();
  await expect(page).toHaveURL(/\/customers\/[^/]+\/bills\/[^/]+$/);
});

test("the operator's Home starts with the day's work", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  const cues = page.getByRole("region", { name: "Your numbers" });
  await expect(cues.getByRole("link").first()).toHaveAccessibleName(/^Need a label: \d+/);
  await expect(cues.getByText("Lowest point, next 90 days")).toHaveCount(0); // no forecast
  for (const [cue, url] of [
    [/^Need a label: \d+ transactions?/, /\/money\?status=needs_label$/],
    [/^Money in not matched: \d+/, /\/money\?dir=in&status=needs_label$/],
    [/^Paying late: \d+ customers?/, /\/customers\?show=late$/],
    [/^Came in this month: Rp/, /\/money\?dir=in&from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/],
  ] as const) {
    await page.goto("/");
    await cues.getByRole("link", { name: cue }).click();
    await expect(page).toHaveURL(url);
  }
});

test("each person arranges their own Home: move, hide, back to the start", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/?arrange=1");
  await page.getByRole("button", { name: "Back to the starting set" }).click();
  const cues = page.getByRole("region", { name: "Your numbers" }).getByRole("link");

  await page.getByRole("button", { name: "Move Need a label down" }).click();
  await expect(cues.first()).toHaveAccessibleName(/^Money in not matched/);
  await page.getByRole("button", { name: "Hide Need a label" }).click();
  await expect(cues.filter({ hasText: "Need a label" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show Days to get paid" }).click();
  await expect(cues.last()).toHaveAccessibleName(/^Days to get paid/);

  // kept after leaving
  await page.getByRole("link", { name: "Done" }).click();
  await expect(cues.first()).toHaveAccessibleName(/^Money in not matched/);

  await page.goto("/?arrange=1");
  await page.getByRole("button", { name: "Back to the starting set" }).click();
  await expect(cues.first()).toHaveAccessibleName(/^Need a label/);
});

test("every health check opens the list it was worked out from", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/health");
  const questions = page.getByRole("heading", { level: 2 });
  test.skip((await questions.count()) === 0, "no health snapshot taken yet in this database");
  const links = page.getByRole("link", { name: /^See .+ →$/ });
  await expect(links).toHaveCount(5); // one per check, healthy or not
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toContain("/customers/bills?status=late_30");
  for (const href of hrefs) {
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
