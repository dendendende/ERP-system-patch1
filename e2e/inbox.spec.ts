import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// Bank rows can never be deleted, so each run uses its own payee name. Letters only: the payee
// finder drops anything with digits, and the rule it creates must not match earlier runs.
const RUN = Array.from(
  { length: 6 },
  () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)],
).join("");
const PAYEE = `PT LABELTEST ${RUN}`;

const statement = (rows: string) => ({
  name: `inbox-${RUN}.csv`,
  mimeType: "text/csv",
  buffer: Buffer.from(`date,description,amount\n${rows}`),
});

test("labelling once with the box ticked labels matching transactions from then on", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");

  const importStatement = async (file: ReturnType<typeof statement>) => {
    await page.goto("/money/import");
    await page.getByLabel("Statement file (CSV)").setInputFiles(file);
    await page.getByRole("button", { name: "Check file" }).click();
    await page.getByRole("button", { name: /^Import \d+ new$/ }).click();
    await expect(page.getByText(/Added \d+ new transactions/)).toBeVisible();
  };

  // 1. a payment arrives and nobody has labelled this payee before
  await importStatement(
    statement(`2026-07-01,"TRSF E-BANKING CR 0701/FTSCY/WS11111 ${PAYEE}",1234\n`),
  );
  await page.goto("/money");
  const item = page.locator("form").filter({ hasText: PAYEE });
  await expect(item).toBeVisible();

  // 2. label it "Subscription income" and keep "label this payee from now on" ticked
  await expect(item.getByRole("checkbox")).toBeChecked();
  await expect(item.getByText(`Label ${PAYEE} this way from now on`)).toBeVisible();
  await item.getByText("Something else…").click();
  await item.getByLabel("Category").selectOption({ label: "Subscription income" });
  await item.getByRole("button", { name: "Save" }).click();
  await expect(item).toHaveCount(0); // the action finished and the inbox re-rendered

  const list = page.getByRole("region", { name: "Transactions" });
  await page.goto(`/money?q=${encodeURIComponent(PAYEE)}`);
  await expect(list.getByText("Subscription income")).toHaveCount(1);
  await expect(list.getByText("Needs label")).toHaveCount(0);

  // 3. next month's payment from the same payee: labelled on arrival, never in the inbox
  await importStatement(
    statement(`2026-08-01,"TRSF E-BANKING CR 0801/FTSCY/WS22222 ${PAYEE}",5678\n`),
  );
  await page.goto(`/money?q=${encodeURIComponent(PAYEE)}`);
  await expect(list.getByText("Subscription income")).toHaveCount(2);
  await expect(list.getByText("Needs label")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("labelled.png"), fullPage: false });
});

test("the inbox suggests categories and shows what is waiting", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/money");
  const inbox = page.locator("form").filter({ hasText: "this way from now on" }).first();
  if (await inbox.isVisible()) {
    await expect(page.getByText(/waiting · showing the \d+ oldest/)).toBeVisible();
    await expect(inbox.getByRole("button")).toHaveCount(3); // three suggestions
    await expect(inbox.getByText("Something else…")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("inbox.png"), fullPage: false });
  }
});
