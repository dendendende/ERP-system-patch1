import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("a customer's page lists the reminders queued for their bill", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test"); // read-only: everyone on the team can see this
  await page.goto("/customers");
  await page.getByRole("link", { name: "CV Sinar Abadi" }).click();

  const list = page.getByRole("region", { name: "Reminders" });
  await expect(list.getByRole("heading", { name: "What we've sent them" })).toBeVisible();
  // the bill's own message, and the steps queued after it, in plain words
  await expect(list.getByText(/^The bill/).first()).toBeVisible();
  await expect(list.getByText(/days late/).first()).toBeVisible();
  await expect(list.getByText(/WhatsApp|Email/).first()).toBeVisible();
});
