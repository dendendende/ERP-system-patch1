import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("renewals coming up, with warning signs", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/customers");
  await page.getByRole("link", { name: "Renewals coming up" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Renewals coming up" })).toBeVisible();

  // a tab applies as soon as it is clicked
  await page
    .getByRole("navigation", { name: "Renewing within" })
    .getByRole("link", { name: "Next 60 days" })
    .click();
  await expect(page).toHaveURL(/within=60/);
  const cards = page.getByRole("region", { name: "Renewals" }).locator(".rounded-xl");
  test.skip((await cards.count()) === 0, "nothing renews in the next 60 days in this database");
  // every card says either what's risky or that nothing is
  for (const card of await cards.all()) {
    await expect(
      card
        .getByText(
          /Paid late last time|Reminders not sent yet|Pays in parts|Recently paused|No warning signs/,
        )
        .first(),
    ).toBeVisible();
  }
  // a viewer can look but not act
  await expect(page.getByRole("button", { name: "Add a reminder to send today" })).toHaveCount(0);
});
