import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// Regular costs are never deleted, so the test reuses one fixed row instead of adding a new one
// every run.
const NAME = "E2E test cost";

test("the owner adds and changes a regular cost; a viewer only looks", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const owner = await browser.newPage();
  await signIn(owner, "e2e-owner@example.test");
  await owner.goto("/money");
  await owner.getByRole("link", { name: "Regular costs" }).click();

  const list = owner.getByRole("region", { name: "Regular costs" });
  // wait for the page before counting, or an empty count while loading adds a second test row
  await expect(list.getByRole("heading", { name: "Your regular costs" })).toBeVisible();
  const card = list.locator(".rounded-xl").filter({ hasText: NAME });
  if ((await card.count()) === 0) {
    const add = owner.locator(".rounded-xl").filter({ has: owner.getByRole("heading", { name: "Add a regular cost" }) });
    await add.getByLabel("Name").fill(NAME);
    await add.getByLabel("Amount (Rp)").fill("12,5"); // not whole rupiah
    await add.getByRole("button", { name: "Add" }).click();
    await expect(add.getByText("Write the amount in rupiah, for example 12.000.000.")).toBeVisible();
    await add.getByLabel("Amount (Rp)").fill("550.000");
    await add.getByRole("button", { name: "Add" }).click();
    await expect(card).toHaveCount(1);
  }

  // start it, then stop it: the state shows on the card
  await card.locator("summary").click(); // the panel stays open between saves
  // ends stopped, so this test row never counts in anyone's forecast
  for (const [state, pill] of [["on", "Paying"], ["off", "Stopped"]] as const) {
    await card.locator("select[name=isActive]").selectOption(state);
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.locator(".rounded-full", { hasText: pill })).toBeVisible(); // the status pill
  }
  await owner.close();

  const viewer = await browser.newPage();
  await signIn(viewer, "e2e-viewer@example.test");
  await viewer.goto("/money/regular-costs");
  await expect(viewer.getByText(NAME)).toBeVisible();
  await expect(viewer.getByRole("heading", { name: "Add a regular cost" })).toHaveCount(0);
  await expect(viewer.locator("summary")).toHaveCount(0);
  await viewer.close();
});
