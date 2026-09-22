import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

/** The customer whose subscription the other tests don't depend on. */
const CUSTOMER = "Toko Berkah";

test("the owner changes a subscription; an operator can't", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();

  const section = page.getByRole("region", { name: "Subscription" });
  await section.locator("summary").first().click();
  const form = section.locator("form").first();

  // a price that isn't whole rupiah is refused, in plain words
  const price = form.getByLabel("Price (Rp)");
  const before = await price.inputValue();
  await price.fill("1.234,56");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText("Write the price in rupiah, for example 1.500.000.")).toBeVisible();

  // pausing it, then putting it back as it was
  await price.fill(before);
  await form.getByLabel("State").selectOption("paused");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText(/every month · paused/)).toBeVisible();

  // saving folds the panel away; open it again to put the subscription back as it was
  await expect(section.locator("details[open]")).toHaveCount(0);
  await section.locator("summary").first().click();
  await form.getByLabel("State").selectOption("active");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText(/every month · next bill/)).toBeVisible();
});

test("an operator sees the subscription but cannot change it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();

  const section = page.getByRole("region", { name: "Subscription" });
  await expect(section).toBeVisible();
  await expect(section.locator("summary")).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Save" })).toHaveCount(0);
});
