import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

// P9-T5: the notifications centre and its bell. A big payment to someone never paid before is
// recorded by hand as the e2e operator (the e2e clean-up removes it afterwards).

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";
const RUN = Array.from(
  { length: 6 },
  () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)],
).join("");

async function bigPaymentToSomeoneNew() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query("begin");
    const { rows } = await db.query("select id from auth.users where email = $1", [
      "e2e-operator@example.test",
    ]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: rows[0].id, role: "authenticated", aal: "aal2" }),
    ]);
    await db.query("set local role authenticated");
    const id = (
      await db.query(
        `select record_by_hand(gen_random_uuid(), (select id from bank_accounts where is_active limit 1),
                               jakarta_today(), 'out', 47000000, $1, null) id`,
        [`E2E NEW PAYEE ${RUN}`],
      )
    ).rows[0].id as string;
    await db.query("commit");
    return id;
  } finally {
    await db.end();
  }
}

test("the bell counts what's new; opening the centre lists it and clears the count", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const id = await bigPaymentToSomeoneNew();
  await signIn(page, "e2e-owner@example.test");

  const bell = page.locator("aside").getByRole("link", { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName(/^Notifications, \d+ new$/);
  await bell.click();
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

  const item = page
    .getByRole("list", { name: "Notifications" })
    .getByRole("listitem")
    .filter({ hasText: `E2E NEW PAYEE ${RUN}` });
  await expect(item.getByText("Rp 47.000.000 went to someone not paid before")).toBeVisible();
  await expect(item.getByText("New", { exact: true })).toBeVisible(); // still marked while read
  // opened: the bell has nothing new (unless the bank has stopped updating, which always counts)
  await expect(bell).toHaveAccessibleName(/^Notifications(, 1 new)?$/);

  await page.reload();
  await expect(item.getByText("New", { exact: true })).toHaveCount(0);
  await item.getByRole("link").click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/money" && url.searchParams.get("open") === id,
  );
});

test("on a phone the bell sits in the header and the page fits the screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone layout");
  await signIn(page, "e2e-viewer@example.test");
  await page
    .locator("header")
    .getByRole("link", { name: /^Notifications/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
