import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// P6-T3: runs against the production build, so it also proves the CSP doesn't block the app.
test("pages carry the security headers, with a fresh script nonce each time", async ({ page }) => {
  const first = await page.goto("/login");
  const headers = first!.headers();
  expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
  const csp = headers["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toContain("unsafe-eval");

  const again = await page.goto("/login");
  expect(again!.headers()["content-security-policy"]).not.toBe(csp);
});

test("the CSP blocks nothing the app itself needs (sign-in, 2FA setup, Home)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text());
  });
  await signIn(page, "e2e-owner@example.test"); // login form + client-side 2FA enrolment
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expect(violations).toEqual([]);
});

test("ten wrong passwords for one email lock it for 15 minutes, even with the right one", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const email = "e2e-viewer@example.test";
  const clear = async () => {
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("delete from rate_limits where key like 'login:%'");
    await db.end();
  };
  await clear();
  try {
    await page.goto("/login");
    for (let i = 0; i < 10; i++) {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(`wrong-${i}`);
      // wait for each answer: the error text from the try before is still on screen
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST"),
        page.getByRole("button", { name: "Sign in" }).click(),
      ]);
      await expect(page.getByText("That email and password don't match.")).toBeVisible();
    }
    await page.getByLabel("Password").fill("Local-dev-pass1"); // the right one (seed.sql)
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Too many tries. Wait 15 minutes")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await clear();
  }
});

test("the owner sees a sign-in from a new device on Home", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test"); // a fresh browser: a new device
  const card = page.locator(".rounded-xl").filter({ hasText: "Signed in from a new device" });
  await expect(card.getByText(/E2E Owner · Chrome on/).first()).toBeVisible();
});
