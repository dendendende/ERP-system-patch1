import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setLastSync(hoursAgo: number) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query(
      `update bank_accounts set last_synced_at = now() - ($1 || ' hours')::interval
        where source = 'aggregator' and is_active`,
      [hoursAgo],
    );
  } finally {
    await db.end();
  }
}

test("bank connections lists accounts; a silent bank warns on Home and in the sidebar", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");

  await setLastSync(0);
  await page.goto("/settings/bank");
  await expect(page.getByRole("heading", { name: "Bank connections" })).toBeVisible();
  await expect(page.getByText("Up to date").first()).toBeVisible();
  await expect(page.getByText(/Bank updated/).first()).toBeVisible(); // sidebar
  await page.screenshot({ path: testInfo.outputPath("bank.png"), fullPage: true });

  // nothing from the bank for 9 hours: warn in the sidebar and on Home
  await setLastSync(9);
  await page.goto("/settings/bank");
  await expect(page.getByText("No recent update").first()).toBeVisible();
  await expect(page.getByText(/No bank update since 9 hours ago/).first()).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(/No bank update since 9 hours ago/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Check bank connections" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("stale-home.png"), fullPage: false });

  await setLastSync(0);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Check bank connections" })).toHaveCount(0);
});

test("only the owner can add or switch off accounts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/settings/bank");
  await expect(page.getByRole("heading", { name: "Add an account" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch off" })).toHaveCount(0);
  await expect(page.getByText("Statements you upload").first()).toBeVisible();
});
