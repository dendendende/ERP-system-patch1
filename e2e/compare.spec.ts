import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth";

// P9-T6: every chart compares with a month or a year before. One choice per page, kept in the
// address, so it survives clicking into a chart and coming back.

const toggle = (page: Page) => page.getByRole("navigation", { name: "Compare the charts" });

test("Money in & out: compare with a year before, keep it while drilling in, turn it off", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/money?from=2026-07-01&to=2026-09-30");
  const charts = page.getByRole("region", { name: "Charts" });
  await expect(charts.getByText("a year before", { exact: true })).toHaveCount(0);

  await toggle(page).getByRole("link", { name: "vs a year before" }).click();
  await expect(page).toHaveURL(/[?&]vs=year/);
  await expect(toggle(page).getByRole("link", { name: "vs a year before" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // every month says what it was a year before
  const months = charts.getByRole("link", { name: /^\w+ 2026: came in Rp/ });
  await expect(months).toHaveCount(3);
  for (const m of await months.all())
    await expect(m).toHaveAccessibleName(/a year before: came in Rp .*, went out Rp /);

  // clicking a month narrows the list and keeps the comparison
  await months.first().click();
  await expect(page).toHaveURL(/from=2026-07-01&to=2026-07-31/);
  await expect(page).toHaveURL(/[?&]vs=year/);

  await toggle(page).getByRole("link", { name: "No comparison" }).click();
  await expect(page).not.toHaveURL(/vs=/);
});

test("bills, customers and Home compare too", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");

  await page.goto("/customers/bills?all=1&vs=month");
  const aging = page.getByRole("figure").filter({ hasText: "Still owed, by how late" });
  await expect(aging.getByText("a month before", { exact: true })).toBeVisible(); // the key to the marks
  await expect(aging.getByRole("link").first()).toHaveAccessibleName(/a month before: Rp /);

  await page.goto("/customers?all=1&vs=year");
  const owes = page.getByRole("figure").filter({ hasText: "Who owes the most" });
  await expect(owes.getByRole("link").first()).toHaveAccessibleName(/a year before: Rp /);

  await page.goto("/?vs=month");
  const home = page.getByRole("region", { name: "Money in and out" });
  await expect(home.getByRole("link", { name: /a month before: came in Rp / })).toHaveCount(6);
  await home.getByRole("link", { name: "No comparison" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(home.getByText("a month before", { exact: true })).toHaveCount(0);
});
