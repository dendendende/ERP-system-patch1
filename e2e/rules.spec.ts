import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// Its own payee per run: bank rows can never be deleted and rules match on the payee name.
const RUN = Array.from(
  { length: 6 },
  () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)],
).join("");
const PAYEE = `CV RULETEST ${RUN}`;

const statement = (rows: string) => ({
  name: `rules-${RUN}.csv`,
  mimeType: "text/csv",
  buffer: Buffer.from(`date,description,amount\n${rows}`),
});

test("switching a rule off stops new labelling but leaves past entries alone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");

  const importStatement = async (rows: string) => {
    await page.goto("/money/import");
    await page.getByLabel("Statement file (CSV)").setInputFiles(statement(rows));
    await page.getByRole("button", { name: "Check file" }).click();
    await page.getByRole("button", { name: /^Import \d+ new$/ }).click();
    await expect(page.getByText(/Added \d+ new transactions/)).toBeVisible();
  };

  // a payment, labelled once with "from now on" ticked -> a rule exists
  await importStatement(`2026-05-01,"PEMBAYARAN ${PAYEE}",4321\n`);
  await page.goto("/money");
  const item = page.locator("form").filter({ hasText: PAYEE });
  await item.getByText("Something else…").click();
  await item.getByLabel("Category").selectOption({ label: "Subscription income" });
  await item.getByRole("button", { name: "Save" }).click();
  await expect(item).toHaveCount(0);

  // the rule shows up with how much it has labelled
  await page.goto("/settings/categories");
  const ruleRow = () =>
    page.getByRole("listitem").filter({ hasText: new RegExp(`contains .${PAYEE}.`) });
  const rule = ruleRow();
  await expect(rule.getByText(/\d+ transactions? labelled/)).toBeVisible();
  await expect(rule.getByText("On", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("rules.png"), fullPage: true });

  await rule.getByRole("button", { name: "Switch off" }).click();
  await expect(ruleRow().getByText("Off", { exact: true })).toBeVisible();

  // what it already labelled is untouched
  const list = page.getByRole("region", { name: "Transactions" });
  await page.goto(`/money?q=${encodeURIComponent(PAYEE)}`);
  await expect(list.getByText("Subscription income")).toHaveCount(1);

  // a new payment from the same payee now needs a label
  await importStatement(`2026-06-01,"PEMBAYARAN ${PAYEE}",8765\n`);
  await page.goto(`/money?q=${encodeURIComponent(PAYEE)}`);
  await expect(list.getByText("Needs label")).toHaveCount(1);
  await expect(list.getByText("Subscription income")).toHaveCount(1);

  // tidy up: label it, so test rows never pile up in the needs-label inbox for later runs
  await list.getByRole("link").first().click();
  await page.getByLabel("What was this for?").selectOption({ label: "Other income" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Labelled by someone", { exact: true })).toBeVisible();
});

test("categories can be added and the built-in ones are protected", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/settings/categories");

  const name = `Training ${RUN}`;
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(`Added ${name}`)).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);

  // a built-in category offers no Remove button
  const salary = page.getByRole("listitem").filter({ hasText: /^Salary/ });
  await expect(salary.getByText("Built in")).toBeVisible();
  await expect(salary.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("an operator cannot open categories and rules", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/settings/categories");
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByText("Only the owner can open this page")).toBeVisible();
});
