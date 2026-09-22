import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("the customer list filters by how each customer is doing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/customers");

  const list = page.getByRole("region", { name: "Customers" });
  const names = list.locator(".truncate.font-medium");
  const tab = (name: string) =>
    page.getByRole("group", { name: "Show" }).getByText(name, { exact: true });
  const show = () => page.getByRole("button", { name: "Show" }).click();

  await expect(names.first()).toBeVisible();
  const all = await names.allInnerTexts();
  expect(all.length).toBeGreaterThan(1);

  // Each filter shows only customers carrying that label
  for (const [filter, label] of [
    ["Renewing soon", "Renewing soon"],
    ["Active", "Active"],
    ["Ended", "Ended"],
  ] as const) {
    await tab(filter).click();
    await show();
    const rows = list.locator("div.flex.items-center");
    for (const row of await rows.all()) {
      if (label === "Active") {
        // "Active" includes those renewing soon or late; all are ongoing, none ended
        await expect(row.getByText("Ended", { exact: true })).toHaveCount(0);
      } else {
        await expect(row.getByText(label, { exact: true })).toHaveCount(1);
      }
    }
  }

  // Search narrows to one customer
  await tab("All").click();
  await page.getByLabel("Search").fill(all[0].slice(0, 6));
  await show();
  for (const name of await names.allInnerTexts()) {
    expect(name.toLowerCase()).toContain(all[0].slice(0, 6).toLowerCase());
  }

  await page.getByLabel("Search").fill("ZZZ NOBODY");
  await show();
  await expect(page.getByText("No customers match what you asked for.")).toBeVisible();
});
