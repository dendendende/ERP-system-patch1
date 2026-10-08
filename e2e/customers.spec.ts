import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("the customer list filters by how each customer is doing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/customers");

  const list = page.getByRole("region", { name: "Customers" });
  const names = list.locator(".truncate.font-medium");
  const tab = (name: string) =>
    page.getByRole("navigation", { name: "Show" }).getByRole("link", { name, exact: true });
  const search = () => page.getByRole("button", { name: "Search" }).click();
  // a tab applies as soon as it is clicked — no button to press
  const pick = async (name: string) => {
    await tab(name).click();
    await expect(tab(name)).toHaveAttribute("aria-current", "page");
  };

  await expect(names.first()).toBeVisible();
  const all = await names.allInnerTexts();
  expect(all.length).toBeGreaterThan(1);

  // Each filter shows only customers carrying that label
  for (const [filter, label] of [
    ["Renewing soon", "Renewing soon"],
    ["Active", "Active"],
    ["Ended", "Ended"],
  ] as const) {
    await pick(filter);
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
  await pick("All");
  await page.getByLabel("Search").fill(all[0].slice(0, 6));
  await search();
  await expect(page).toHaveURL(/q=/);
  for (const name of await names.allInnerTexts()) {
    expect(name.toLowerCase()).toContain(all[0].slice(0, 6).toLowerCase());
  }

  // the search keeps the chosen tab
  await pick("Late");
  await expect(page).toHaveURL(/show=late.*q=|q=.*show=late/);
  await page.getByLabel("Search").fill("ZZZ NOBODY");
  await search();
  await expect(page).toHaveURL(/show=late/);
  await expect(page.getByText("No customers match what you asked for.")).toBeVisible();
});
