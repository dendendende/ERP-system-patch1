import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";
const clear = async () => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  await db.query(
    "delete from saved_views where user_id in (select id from auth.users where email like 'e2e-%')",
  );
  await db.end();
};

test("save a view, reopen it in one click; the owner gives operators a starting view", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await clear();
  try {
    await signIn(page, "e2e-owner@example.test");
    await page.goto("/money?status=needs_label");
    await page.getByText("+ Save this view").click();
    await page.getByLabel("Name").fill("To label");
    await page.getByLabel("Also the starting view for").selectOption("operator");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const view = page.getByRole("link", { name: /^To label · starting view for operators/ });
    await expect(view).toBeVisible();

    // "Everything", then back to the view in one click
    await page.getByRole("link", { name: "Everything" }).click();
    await expect(page).toHaveURL(/all=1/);
    await view.click();
    await expect(page).toHaveURL(/status=needs_label/);
    await expect(view).toHaveAttribute("aria-current", "page");

    // an operator opening Money in & out starts on it, and can't remove it
    const theirs = await browser.newContext();
    const them = await theirs.newPage();
    await signIn(them, "e2e-operator@example.test");
    await them.goto("/money");
    await expect(them).toHaveURL(/status=needs_label/);
    await expect(them.getByRole("button", { name: "Remove the view To label" })).toHaveCount(0);
    // "Everything" doesn't bounce back to the starting view
    await them.getByRole("link", { name: "Everything" }).click();
    await expect(them).toHaveURL(/all=1/);
    await theirs.close();

    // the owner removes it
    await page.getByRole("button", { name: "Remove the view To label" }).click();
    await expect(view).toHaveCount(0);
  } finally {
    await clear();
  }
});
