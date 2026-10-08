import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";
const clear = async () => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  await db.query("delete from parallel_run_weeks");
  await db.end();
};

test("the owner writes down a week; a difference is shown to the rupiah", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await clear();
  try {
    await signIn(page, "e2e-owner@example.test");
    await page.goto("/settings");
    await page.getByRole("link", { name: /Parallel run/ }).click();
    await expect(page.getByText("No weeks written down yet")).toBeVisible();

    await page.getByLabel("Came in that week (Rp)").fill("12,5");
    await page.getByLabel("Went out that week (Rp)").fill("0");
    await page.getByLabel("Cash in the bank right now (Rp)").fill("1");
    await page.getByLabel("Still owed by customers right now (Rp)").fill("0");
    await page.getByRole("button", { name: "Save and compare" }).click();
    await expect(page.getByText("Write each amount in whole rupiah")).toBeVisible();

    await page.getByLabel("Came in that week (Rp)").fill("1");
    await page.getByRole("button", { name: "Save and compare" }).click();
    await expect(page.getByText(/^Saved the week from/)).toBeVisible();

    const week = page.locator(".rounded-xl").filter({ has: page.getByRole("table") });
    await expect(week.getByText("Doesn't match")).toBeVisible();
    const cash = week.getByRole("row", { name: /Cash in the bank/ });
    await expect(cash.getByRole("cell").first()).toHaveText(/^Rp\s?1$/);
    await expect(page.getByText("ready for go-live")).toHaveCount(0);
  } finally {
    await clear();
  }
});
