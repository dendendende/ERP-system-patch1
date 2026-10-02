import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("Home says where the money stands at a glance", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/");

  await expect(page.getByText(/^You have Rp .+ in the bank/)).toBeVisible();
  const month = page.getByRole("region", { name: "This month" });
  for (const label of ["Came in this month", "Went out this month", "Still owed to you"]) {
    await expect(month.getByText(label)).toBeVisible();
  }
  const chart = page.getByRole("region", { name: "Money in and out" });
  await expect(chart.getByRole("table")).toHaveCount(1); // the numbers behind the bars
  await expect(chart.getByText(/months|pattern/)).toBeVisible();
});

test("the health pill leads to Business health", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/");
  const pill = page.getByRole("link", { name: /Business looks healthy|needs watching|needs attention/ });
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
  const pills = await page.getByText(/^(Needs attention|Keep an eye on it|Healthy)$/).allInnerTexts();
  const rank = { "Needs attention": 2, "Keep an eye on it": 1, Healthy: 0 } as Record<string, number>;
  expect(pills.map((p) => rank[p])).toEqual([...pills.map((p) => rank[p])].sort((a, b) => b - a));
});
