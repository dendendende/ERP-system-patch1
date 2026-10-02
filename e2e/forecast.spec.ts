import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

for (const email of ["e2e-owner@example.test", "e2e-viewer@example.test"]) {
  test(`${email.split("@")[0]} sees the forecast`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "desktop covers the flow");
    await signIn(page, email);
    await page.goto("/");
    await page.getByRole("link", { name: "See the next 90 days" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Cash forecast" })).toBeVisible();
    await expect(page.getByText(/^In 60 days you'll have about Rp/)).toBeVisible();
    await expect(page.getByRole("img", { name: /next 90 days/ })).toBeVisible();
    await expect(page.getByText("Forecast assumes customers pay like they usually do.")).toBeVisible();
    await page.getByText("What this forecast assumes").click();
    await expect(page.getByText("Starts from the money in the bank today.")).toBeVisible();
  });
}

test("an operator can't open the forecast, and isn't offered it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "See the next 90 days" })).toHaveCount(0);
  await page.goto("/forecast");
  await expect(page).toHaveURL(/\/forbidden/);
});
