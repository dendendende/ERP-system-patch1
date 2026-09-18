// Signs in a seeded local user through the real UI, including TOTP 2FA setup.
// Needs the local Supabase stack (`pnpm db:start`) — never point this at staging/production.
import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "Local-dev-pass1"; // seed.sql, local only

export function totp(base32Secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...base32Secret.replace(/=+$/, "")]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = h[19] & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Removes the user's 2FA factors so the test can enrol from scratch. */
async function resetFactors(email: string) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query(
      "delete from auth.mfa_factors where user_id = (select id from auth.users where email = $1)",
      [email],
    );
  } finally {
    await db.end();
  }
}

export async function signIn(page: Page, email: string) {
  await resetFactors(email);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/login\/enroll/);
  await page.getByText("Can't scan?").click();
  const secret = (await page.locator("details code").innerText()).trim();
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on and continue" }).click();
  await expect(page).toHaveURL(/\/$/);
}
