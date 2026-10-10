import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P7-T7: the object floorplan, on a transaction — key facts on top, sections with a jump nav.

test("a transaction shows its key facts first, and the jump nav reaches each section", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/money?all=1");
  await page
    .getByRole("region", { name: "Transactions" })
    .locator("tbody tr[data-row]")
    .filter({ hasNotText: "By hand" })
    .first()
    .getByRole("link")
    .click();
  // the list opens it in the side panel; "Open as a page" gives it the whole screen
  await expect(page).toHaveURL(/[?&]open=[0-9a-f-]{36}/);
  await page
    .locator("aside[aria-labelledby]")
    .getByRole("link", { name: "Open as a page" })
    .click();
  await expect(page).toHaveURL(/\/money\/[0-9a-f-]{36}$/);

  const facts = page.locator("header dl");
  for (const label of ["Category", "Account", "Came from", "Bill"]) {
    await expect(facts.getByText(label, { exact: true })).toBeVisible();
  }

  const nav = page.getByRole("navigation", { name: "Sections" });
  // the first section is the one being read (money in not matched yet starts with "Match a bill")
  await expect(nav.getByRole("link").first()).toHaveAttribute("aria-current", "location");
  await nav.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/#history$/);
  await expect(nav.getByRole("link", { name: "History" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await expect(page.getByRole("region", { name: "Change history" })).toBeInViewport();
});
