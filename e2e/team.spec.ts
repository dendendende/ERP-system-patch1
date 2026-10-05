import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn, totp } from "./auth";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// People are never deleted by the app; the test removes its invitees (this run's and any left
// by a failed run) so runs don't pile up.
async function removeInvitees() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("alter table public.users disable trigger users_guard");
    await db.query(
      "alter table public.sign_in_devices disable trigger sign_in_devices_no_update_delete",
    );
    await db.query(
      "delete from public.sign_in_devices where user_id in (select id from auth.users where email like 'e2e-invitee-%')",
    );
    await db.query("delete from auth.users where email like 'e2e-invitee-%'");
    await db.query(
      "alter table public.sign_in_devices enable trigger sign_in_devices_no_update_delete",
    );
    await db.query("alter table public.users enable trigger users_guard");
    await db.query("commit");
  } finally {
    await db.end();
  }
}

test("the owner adds an operator, who joins with the link; switching them off locks them out at once", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const email = `e2e-invitee-${Date.now()}@example.test`;
  try {
    await signIn(page, "e2e-owner@example.test");
    await page.goto("/settings");
    await page.getByRole("link", { name: /^Team/ }).click();

    await page.getByLabel("Name").fill("Ina Invitee");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("What they can do").selectOption("operator");
    await page.getByRole("button", { name: "Add and make a sign-in link" }).click();
    const link = (
      await page.locator("code").filter({ hasText: "/auth/confirm?" }).innerText()
    ).trim();

    const member = page.getByRole("listitem").filter({ hasText: email });
    await expect(member.getByText("Hasn't joined yet")).toBeVisible();
    await expect(member.getByText("Operator", { exact: true })).toBeVisible();

    // the invitee, in their own browser
    const theirs = await browser.newContext();
    const them = await theirs.newPage();
    await them.goto(link);
    await them.getByRole("button", { name: "Continue" }).click();
    await expect(them).toHaveURL(/\/login\/set-password/);
    await them.getByLabel("New password").fill("short");
    await them.getByLabel("Type it again").fill("short");
    await them.getByRole("button", { name: "Save and continue" }).click();
    await expect(them.getByText(/at least 12 characters/).last()).toBeVisible();
    await them.getByLabel("New password").fill("Invitee-pass-123");
    await them.getByLabel("Type it again").fill("Invitee-pass-123");
    await them.getByRole("button", { name: "Save and continue" }).click();
    await expect(them).toHaveURL(/\/login\/enroll/);
    await them.getByText("Can't scan?").click();
    const secret = (await them.locator("details code").innerText()).trim();
    await them.getByLabel("6-digit code").fill(totp(secret));
    await them.getByRole("button", { name: "Turn on and continue" }).click();
    await expect(them).toHaveURL(/\/$/);
    await them.goto("/money/import"); // operator page
    await expect(them).toHaveURL(/\/money\/import/);

    // the link works once
    const again = await browser.newContext();
    const replay = await again.newPage();
    await replay.goto(link);
    await replay.getByRole("button", { name: "Continue" }).click();
    await expect(replay.getByText("That link has expired or was already used.")).toBeVisible();
    await again.close();

    // the owner sees them joined, then switches them off
    await page.reload();
    await expect(member.getByText("Hasn't joined yet")).toHaveCount(0);
    await member.getByRole("button", { name: "Switch off" }).click();
    await expect(member.getByText("Switched off")).toBeVisible();

    await them.goto("/money");
    await expect(them).toHaveURL(/\/login/);
    await theirs.close();

    // and the change is in the history, with who made it
    await page.goto("/settings/audit-log?table=users");
    await expect(
      page.getByRole("listitem").filter({ hasText: "Changed team member Ina Invitee" }).first(),
    ).toContainText("E2E Owner");
  } finally {
    await removeInvitees();
  }
});

test("an operator cannot open the team screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/settings/team");
  await expect(page).toHaveURL(/\/forbidden/);
});
