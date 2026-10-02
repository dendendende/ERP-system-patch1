import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

const CUSTOMER = "PT Karya Digital"; // has an email address

test("send a reminder now, pause and resume — then tidy up", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const amount = `5.${String(100 + Math.floor(Math.random() * 800))}.000`;
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();

  await page.getByLabel("Amount (Rp)").fill(amount);
  await page.getByRole("button", { name: "Write bill" }).click();
  await expect(page.getByText("Bill written.")).toBeVisible();
  const bill = page.getByRole("region", { name: "Bills" }).locator(".rounded-xl").filter({ hasText: `Rp ${amount}` }).first();
  const number = (await bill.getByText(/^INV-\d+$/).innerText()).trim();

  // put one on today's list; the timeline shows it waiting to be sent
  await bill.getByRole("button", { name: "Add a reminder to send today" }).click();
  await expect(bill.getByText(/^Added to "Reminders to send" on Home/)).toBeVisible();
  const timeline = page.getByRole("region", { name: "Reminders" });
  await expect(timeline.getByText(new RegExp(`Reminder, added by hand · ${number}`))).toBeVisible();

  // pausing needs a reason; once paused, the page says so and "send now" is gone
  await timeline.getByRole("button", { name: "Pause reminders" }).click();
  await expect(timeline.getByText("Say why reminders are being paused.")).toBeVisible();
  await timeline.getByLabel("Pause reminders — why?").fill("Agreed to pay next month");
  await timeline.getByRole("button", { name: "Pause reminders" }).click();
  await expect(timeline.getByText("Reminders are paused for this customer.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a reminder to send today" })).toHaveCount(0);

  await timeline.getByRole("button", { name: "Turn reminders back on" }).click();
  await expect(timeline.getByText("Reminders are paused for this customer.", { exact: false })).toHaveCount(0);

  // tidy up: cancel the test bill (its queued reminders are cancelled with it)
  const card = page.getByRole("region", { name: "Bills" }).locator(".rounded-xl").filter({ hasText: number }).first();
  await card.locator("summary").click();
  await card.getByLabel("Cancel this bill — why?").fill("End of test");
  await card.getByRole("button", { name: "Cancel bill" }).click();
  await expect(card.getByText("Cancelled")).toBeVisible();
});

test("a viewer sees the timeline but none of the controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/customers");
  await page.getByRole("link", { name: CUSTOMER }).click();
  await expect(page.getByRole("region", { name: "Reminders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a reminder to send today" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pause reminders|Turn reminders back on/ })).toHaveCount(0);
});
