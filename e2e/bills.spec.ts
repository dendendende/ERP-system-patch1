import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P8-T8a/b: every bill in one list — filtered, totalled, charted — and one bill in the side panel.

test("the bills list: late bills, a lateness bucket, one bill beside the list", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/customers/bills?status=waiting");
  await expect(page.getByRole("heading", { level: 1, name: "Bills" })).toBeVisible();

  // the totals open the list behind them
  const totals = page.getByRole("region", { name: "Totals" });
  await expect(totals.getByText("Still owed")).toBeVisible();
  await totals.getByRole("link", { name: /Past due/ }).click();
  await expect(page).toHaveURL(/status=late/);
  await expect(page.getByRole("link", { name: "Remove filter: Late" })).toBeVisible();

  // a bar of the aging chart narrows to that bucket
  await page.goto("/customers/bills?status=waiting");
  const notDue = page
    .getByRole("region", { name: "Charts" })
    .getByRole("link", { name: /^Not due yet:/ });
  test.skip((await notDue.count()) === 0, "nothing owed in this database");
  await notDue.click();
  await expect(page).toHaveURL(/bucket=0/);

  // a bill opens in the side panel; "Open as a page" gives it the whole screen
  const list = page.getByRole("region", { name: "Bills" });
  const first = list.locator("tbody tr[data-row]").first().getByRole("link").first();
  const number = (await first.innerText()).trim();
  await first.click();
  await expect(page).toHaveURL(/[?&]open=[0-9a-f-]{36}/);
  const panel = page.locator("aside[aria-labelledby]"); // the side panel (the sidebar is an aside too)
  await expect(panel.getByRole("heading", { name: number })).toBeVisible();
  await expect(panel.getByText("still owed")).toBeVisible();
  await panel.getByRole("link", { name: "Open as a page" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\/bills\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: number })).toBeVisible();
  // a viewer reads; only the team changes a bill
  await expect(page.getByRole("button", { name: "Cancel bill" })).toHaveCount(0);
});
