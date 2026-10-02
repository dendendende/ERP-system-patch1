import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("the owner changes a health limit, and a nonsense one is refused", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/settings");
  await page.getByRole("link", { name: /Health limits/ }).click();

  const runway = page.locator(".rounded-xl").filter({ has: page.getByRole("heading", { name: "How long the cash lasts" }) });
  const safe = runway.getByLabel(/Safe when more than/);
  const danger = runway.getByLabel(/Danger when less than/);

  // danger above safe makes no sense
  await danger.fill("20");
  await runway.getByRole("button", { name: "Save" }).click();
  await expect(runway.getByText("The warning limit has to sit on the unsafe side of the safe limit.")).toBeVisible();

  await safe.fill("18");
  await danger.fill("6");
  await runway.getByRole("button", { name: "Save" }).click();
  await expect(runway.getByText(/^Saved: safe limit 18, danger limit 6\./)).toBeVisible();

  // put it back, so later runs start from the defaults
  await safe.fill("12");
  await runway.getByRole("button", { name: "Save" }).click();
  await expect(runway.getByText(/^Saved: safe limit 12, danger limit 6\./)).toBeVisible();
});

test("an operator cannot open health limits", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/settings/health");
  await expect(page).toHaveURL(/\/forbidden/);
});
