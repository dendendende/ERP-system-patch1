import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P7-T8: every chart mark is a link; the click is the filter, carried in the address.

test("a click on any chart narrows to what was clicked", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/dev/charts");
  const picked = page.getByRole("status");

  // bar: one month
  await page.getByRole("link", { name: /^March 2026: came in .* Show only March 2026\.$/ }).click();
  await expect(page).toHaveURL(/\?month=Mar$/);
  await expect(picked).toContainText("month = Mar");

  // stacked: one part of one month
  await page.getByRole("link", { name: /^Rent, April 2026: Rp/ }).click();
  await expect(page).toHaveURL(/\?month=Apr&category=Rent$/);

  // line: pointing shows the numbers, a click picks the month
  const may = page.getByRole("link", { name: /^May 2026: in the bank/ });
  await may.hover();
  await expect(may.getByText("In the bank")).toBeVisible();
  await may.click();
  await expect(page).toHaveURL(/\?month=May$/);

  // aging: one bucket
  await page.getByRole("link", { name: /^31–60 days late: .* on 2 bills\./ }).click();
  await expect(page).toHaveURL(/\?late=31-60$/);

  // donut: past six parts the smallest fold into Other; the legend and the ring both pick
  const legend = page.getByRole("link", { name: /^Other: .* of Rp/ });
  await expect(legend).toBeVisible();
  await page.getByRole("link", { name: /^Software: / }).click();
  await expect(page).toHaveURL(/\?category=Software$/);
  // the ring starts at the top and goes clockwise: the right edge is inside the first part
  const ring = page.locator("figure svg a").first();
  const box = (await ring.boundingBox())!;
  await ring.click({ position: { x: box.width - 3, y: box.height / 2 } });
  await expect(page).toHaveURL(/\?category=Salaries$/);
  await expect(picked).toContainText("category = Salaries");
});
