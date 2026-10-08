import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";
const PASSWORD = "Local-dev-pass1"; // seed.sql, local only

test("the owner switches 2-step sign-in off and on again; it applies at once", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  try {
    await signIn(page, "e2e-owner@example.test");
    await page.goto("/settings/team");
    await page.getByRole("button", { name: "Switch off for now" }).click();
    await expect(page.getByText("Off", { exact: true })).toBeVisible();

    // someone else: the password is enough, and they see the app's data
    const theirs = await browser.newContext();
    const them = await theirs.newPage();
    await them.goto("/login");
    await them.getByLabel("Email").fill("e2e-viewer@example.test");
    await them.getByLabel("Password").fill(PASSWORD);
    await them.getByRole("button", { name: "Sign in" }).click();
    await expect(them).toHaveURL(/\/$/);
    await expect(them.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();

    // switched back on: their next click asks for the 6-digit code
    await page.getByRole("button", { name: "Switch on for everyone" }).click();
    await expect(page.getByText("Required for everyone")).toBeVisible();
    await them.goto("/money");
    await expect(them).toHaveURL(/\/login\/(enroll|verify)/);
    await theirs.close();

    // and the change history says who switched it
    await page.goto("/settings/audit-log");
    await expect(
      page.getByText("Changed 2-step sign-in required from no to yes").first(),
    ).toBeVisible();
  } finally {
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("update security_settings set require_two_factor = true");
    await db.end();
  }
});
