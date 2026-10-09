import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("the owner moves a reminder step, sees the message preview, and puts it back", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/settings");
  await page.getByRole("link", { name: /Reminders/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reminders" })).toBeVisible();

  const step = page
    .locator(".rounded-xl")
    .filter({ has: page.getByRole("heading", { name: "7 days before it's due" }) });
  await expect(step).toBeVisible();

  // the preview shows the message in both languages, with the fixed account and warning
  await step.getByText("Preview the message").click();
  await expect(step.getByText("Bahasa Indonesia")).toBeVisible();
  await expect(step.getByText(/We will never change it by message\./)).toBeVisible();

  // a customer step needs a way to reach them
  await step.getByLabel("Email").uncheck();
  await step.getByRole("button", { name: "Save" }).click();
  await expect(step.getByText("Choose how to reach them, or switch this step off.")).toBeVisible();
  await step.getByLabel("Email").check();

  // move it to 5 days before…
  await step.getByLabel("Days").fill("5");
  await step.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "5 days before it's due" })).toBeVisible();

  // …and back, so later runs start from the default schedule
  const moved = page
    .locator(".rounded-xl")
    .filter({ has: page.getByRole("heading", { name: "5 days before it's due" }) });
  await moved.getByLabel("Days").fill("7");
  await moved.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "7 days before it's due" })).toBeVisible();
});

test("an operator cannot open the reminder settings", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/settings/reminders");
  await expect(page).toHaveURL(/\/forbidden/);
});
