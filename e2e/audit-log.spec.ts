import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("the owner sees a health limit change in plain words and narrows to that record", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");

  // make a change that is sure to be logged (and put it back)
  await page.goto("/settings/health");
  const runway = page
    .locator(".rounded-xl")
    .filter({ has: page.getByRole("heading", { name: "How long the cash lasts" }) });
  await runway.getByLabel(/Safe when more than/).fill("13");
  await runway.getByRole("button", { name: "Save" }).click();
  await expect(runway.getByText(/^Saved: safe limit 13/)).toBeVisible();
  await runway.getByLabel(/Safe when more than/).fill("12");
  await runway.getByRole("button", { name: "Save" }).click();
  await expect(runway.getByText(/^Saved: safe limit 12/)).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("link", { name: /Change history/ }).click();
  await page.getByLabel("What").selectOption("health_thresholds");
  await page.getByRole("button", { name: "Show" }).click();

  const latest = page
    .getByRole("listitem")
    .filter({ hasText: "Changed health limit how long the cash lasts" })
    .first();
  await expect(latest.getByText("Changed safe limit from 13 to 12")).toBeVisible();
  await expect(page.getByText(/health_thresholds|healthy_limit/)).toHaveCount(0);

  await latest.getByRole("link", { name: "All changes to this" }).click();
  await expect(page.getByText("Showing one record only")).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: /^Changed health limit/ })
      .filter({ hasNotText: "how long the cash lasts" }),
  ).toHaveCount(0);
});

test("an operator cannot open the change history", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/settings/audit-log");
  await expect(page).toHaveURL(/\/forbidden/);
});
