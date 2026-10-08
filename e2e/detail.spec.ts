import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

test("editing a transaction shows up in its history with who and when", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");

  // open the first transaction the bank sent (not one typed in by hand)
  await page.goto("/money");
  const list = page.getByRole("region", { name: "Transactions" });
  await list
    .locator("tbody tr[data-row]")
    .filter({ hasNotText: "By hand" })
    .first()
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/money\/[0-9a-f-]{36}$/);

  // raw bank data is shown and cannot be edited
  await expect(page.getByRole("heading", { name: "Straight from the bank" })).toBeVisible();
  await expect(page.getByText("Bank's own id")).toBeVisible();

  const note = `checked by e2e ${Date.now().toString().slice(-5)}`;
  await page.getByLabel("What was this for?").selectOption({ index: 1 });
  const chosen = await page.getByLabel("What was this for?").inputValue();
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Save" }).click();

  const history = page.locator("section, div").filter({ hasText: "Change history" }).last();
  await expect(history.getByText("E2E Operator").first()).toBeVisible();
  await expect(history.getByText(`"${note}"`)).toBeVisible();
  await expect(history.getByText("Category:").first()).toBeVisible();
  expect(chosen).not.toBe("");

  await page.screenshot({ path: testInfo.outputPath("detail.png"), fullPage: true });
});

test("a viewer can read a transaction but not change it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/money");
  await page
    .getByRole("region", { name: "Transactions" })
    .locator("tbody")
    .getByRole("link")
    .first()
    .click();
  await expect(page.getByText("only the team can change labels")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});
