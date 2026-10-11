import { expect, type Locator, type Page, test } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./auth";

// P9-T7: times the app at size. Runs only while the 50,000 made-up bank rows are in the local
// database (`node scripts/perf-data.mjs add`; `remove` takes them out again), else skips.
// Home: the whole page, every cue streamed in, under 1.5s. Lists: what you click answers in
// under 100ms.

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:44322/postgres";

test.beforeAll(async () => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  const { rows } = await db.query(
    "select count(*)::int n from bank_transactions where external_id like 'perf-%'",
  );
  await db.end();
  test.skip(rows[0].n < 50_000, "no perf data: node scripts/perf-data.mjs add");
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "timed on desktop");
  await signIn(page, "e2e-owner@example.test");
});

/** Loads the page 4 times and gives the median ms until its last byte (streamed parts too). */
async function loadTime(page: Page, url: string) {
  const times: number[] = [];
  for (let i = 0; i < 4; i++) {
    await page.goto(url, { waitUntil: "load" });
    times.push(
      await page.evaluate(() => {
        const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        return nav.responseEnd - nav.startTime;
      }),
    );
  }
  const median = times.sort((a, b) => a - b)[2];
  console.log(`${url}: ${times.map(Math.round).join(", ")} ms → median ${Math.round(median)}`);
  return median;
}

/** ms from a click until the next frame is painted, measured in the page (as INP is). */
function clickTime(target: Locator) {
  return target.evaluate(
    (el) =>
      new Promise<number>((done) => {
        const t = performance.now();
        (el as HTMLElement).click();
        requestAnimationFrame(() => setTimeout(() => done(performance.now() - t)));
      }),
  );
}

test("Home loads under 1.5s with 50,000 transactions", async ({ page }) => {
  expect(await loadTime(page, "/")).toBeLessThan(1500);
  await expect(page.getByText(/^You have Rp .+ in the bank/)).toBeVisible();
});

test("the lists load quickly with 50,000 transactions", async ({ page }) => {
  expect(await loadTime(page, "/money")).toBeLessThan(1500);
  expect(await loadTime(page, "/money?vs=year")).toBeLessThan(1500);
  expect(await loadTime(page, "/customers/bills")).toBeLessThan(1500);
  expect(await loadTime(page, "/notifications")).toBeLessThan(1500);
});

test("ticking rows and choosing columns in the money list answer in under 100ms", async ({
  page,
}) => {
  await page.goto("/money", { waitUntil: "networkidle" });
  const table = page.getByRole("table", { name: "Transactions matching the filters" });
  await expect(table.locator("tbody tr[data-row]").first()).toBeVisible();

  const times = {
    "tick one": await clickTime(table.getByRole("checkbox", { name: "Tick this row" }).first()),
    "tick all 500": await clickTime(table.getByRole("checkbox", { name: "Tick all" })),
    "untick all": await clickTime(page.getByRole("button", { name: "Untick all" })),
    "open Columns": await clickTime(page.getByText("Columns", { exact: true })),
    "hide a column": await clickTime(
      page.getByRole("group", { name: "Columns to show" }).getByRole("checkbox").first(),
    ),
  };
  console.log(
    Object.entries(times)
      .map(([k, v]) => `${k} ${Math.round(v)}ms`)
      .join(", "),
  );
  for (const ms of Object.values(times)) expect(ms).toBeLessThan(100);
  // and each click did what it says
  await expect(page.getByRole("region", { name: "Ticked rows" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Columns to show" })).toBeVisible();
  await page.getByRole("group", { name: "Columns to show" }).getByRole("checkbox").first().check(); // put it back
});
