import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// Fixed content: the first run imports it, every later run finds only duplicates.
// (bank_transactions can never be deleted, so the test must be safe to repeat.)
const STATEMENT = Buffer.from(
  "date,description,amount,balance\n" +
    '2026-08-01,"E2E TRSF CR PT CONTOH",2500000,2500000\n' +
    "2026-08-01,E2E BIAYA ADM,-15.000,2485000\n" +
    "2026-08-01,E2E BIAYA ADM,-15.000,2470000\n",
);

const count = (label: string) => `dt:text-is("${label}") + dd`;

test("importing the same statement twice adds nothing the second time", async ({ page }) => {
  test.skip(test.info().project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");

  const upload = async () => {
    await page.goto("/money/import");
    await page
      .getByLabel("Bank account")
      .selectOption({ label: "BCA · PT Contoh Operasional · ••1234" });
    await page.getByLabel("Statement file (CSV)").setInputFiles({
      name: "e2e-statement.csv",
      mimeType: "text/csv",
      buffer: STATEMENT,
    });
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByText("e2e-statement.csv")).toBeVisible();
  };

  await upload();
  await expect(page.locator(count("Can't read"))).toHaveText("0");
  const importButton = page.getByRole("button", { name: /^Import \d+ new$/ });
  if (await importButton.isVisible()) {
    await importButton.click();
    await expect(page.getByText(/Added \d+ new transactions/)).toBeVisible();
  }

  await upload();
  await expect(page.locator(count("New"))).toHaveText("0");
  await expect(page.locator(count("Already imported"))).toHaveText("3");
  await expect(importButton).toHaveCount(0);
});

test("a statement with an unreadable row imports nothing", async ({ page }) => {
  test.skip(test.info().project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money/import");
  await page.getByLabel("Statement file (CSV)").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,description,amount\n2026-08-02,E2E OK,1000\n2026-08-02,E2E CENTS,10.50\n",
    ),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("Row 3:")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import/ })).toHaveCount(0);
});
