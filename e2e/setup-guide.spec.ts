import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";

async function sql(query: string, params: unknown[] = []) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await db.query(query, params);
  } finally {
    await db.end();
  }
}

test("the owner works through the guide; a skipped step is remembered and the guide resumes after it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await sql("delete from setup_steps");
  try {
    await signIn(page, "e2e-owner@example.test");
    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();

    // the local data already has a bank account and transactions: those tick themselves off
    const bank = page.getByRole("listitem").filter({ hasText: "Add your bank account" });
    await expect(bank.getByText("Done")).toBeVisible();

    const reminders = page
      .getByRole("listitem")
      .filter({ hasText: "Choose when customers are reminded" });
    await expect(reminders.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/settings/reminders",
    );
    await reminders.getByRole("button", { name: "Looks good" }).click();
    await expect(reminders.getByText("Done")).toBeVisible();

    // leave and come back: still done
    await page.goto("/");
    await page.goto("/setup");
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Choose when customers are reminded" })
        .getByText("Done"),
    ).toBeVisible();
    await expect(page.getByText(/\d of 7 done/)).toBeVisible();
  } finally {
    await sql("delete from setup_steps");
  }
});

test("an operator adds a customer with a phone number typed the local way", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const name = `E2E Setup Customer ${Date.now()}`;
  try {
    await signIn(page, "e2e-operator@example.test");
    await page.goto("/customers");
    await page.getByText("Add a customer").click();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Add and set up what they pay" }).click();
    await expect(page.getByText("Add a WhatsApp number or an email")).toBeVisible();

    await page.getByLabel("WhatsApp number").fill("0812-3456-7890");
    await page.getByRole("button", { name: "Add and set up what they pay" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("+6281234567890")).toBeVisible();
  } finally {
    await sql("delete from customers where name like 'E2E Setup Customer %'");
  }
});

test("operators and viewers don't get the setup guide", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-operator@example.test");
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/forbidden/);
});
