import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P9-T1: the report library — run a report with its parameters, keep it as a favourite.

test("run a report for a day, keep it as a favourite, open it again, remove it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test"); // reports are for everyone on the team
  await page.getByRole("link", { name: "Reports" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();

  await page.getByRole("link", { name: /^Revenue by plan/ }).click();
  await expect(page).toHaveURL(/report=revenue_by_plan/);
  await page.getByLabel("Up to").fill("2026-09-30");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page).toHaveURL(/report=revenue_by_plan&on=2026-09-30/);
  await expect(page.getByRole("table", { name: "Revenue by plan" })).toBeVisible();

  // the same run, downloaded: a PDF to print, a CSV for a spreadsheet
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PDF" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe("revenue_by_plan-2026-09-30.pdf");
  const pdfBytes = await (await pdf.createReadStream()).toArray();
  expect(Buffer.concat(pdfBytes).toString("latin1", 0, 8)).toBe("%PDF-1.4");
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download for Excel (CSV)" }).click(),
  ]);
  const csvText = Buffer.concat(await (await csv.createReadStream()).toArray()).toString("utf8");
  expect(csvText.replace(/^﻿/, "").split("\r\n")[0]).toBe("Plan,Came in (Rp),Share");

  const name = `E2E plans ${Date.now().toString().slice(-6)}`;
  await page.getByText("☆ Add to favourites").click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("link", { name: "← All reports" }).click();
  const favourites = page.getByRole("region", { name: "Your favourites" });
  await favourites.getByRole("link", { name }).click();
  // the favourite kept the day it was run for
  await expect(page).toHaveURL(/report=revenue_by_plan&on=2026-09-30/);
  await expect(page.getByLabel("Up to")).toHaveValue("2026-09-30");

  await page.goto("/reports");
  await favourites.getByRole("button", { name: `Remove the favourite ${name}` }).click();
  await expect(favourites.getByRole("link", { name })).toHaveCount(0);
});

test("a report that doesn't exist is not found", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  // the page streams (it has a loading screen), so the words are what to check, not the status
  await page.goto("/reports?report=nope");
  await expect(page.getByText("We couldn't find that page")).toBeVisible();
});

test("the eight reports: the owner runs the cashflow statement and the change history extract", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/reports");
  const library = page.getByRole("region", { name: "All reports" });
  await expect(library.getByRole("link")).toHaveCount(8);

  await library.getByRole("link", { name: /^Cashflow statement/ }).click();
  const table = page.getByRole("table", { name: "Cashflow statement" });
  for (const line of [
    "Cash in the bank at the start",
    "Came in",
    "Went out",
    "Cash in the bank at the end",
    "Not explained by the transactions",
  ]) {
    await expect(table.getByRole("cell", { name: line, exact: true })).toBeVisible();
  }

  await page.goto("/reports?report=audit_extract");
  await expect(page.getByRole("table", { name: "Change history extract" })).toBeVisible();
});

test("a viewer isn't offered the change history extract, and can't open it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  await signIn(page, "e2e-viewer@example.test");
  await page.goto("/reports");
  const library = page.getByRole("region", { name: "All reports" });
  await expect(library.getByRole("link")).toHaveCount(7);
  await expect(library.getByText("Change history extract")).toHaveCount(0);
  await page.goto("/reports?report=audit_extract");
  await expect(page.getByText("We couldn't find that page")).toBeVisible();
});
