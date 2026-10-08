import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P6-T5: keyboard use, and a sweep over every screen.
const SCREENS = [
  "/",
  "/money",
  "/money/import",
  "/money/regular-costs",
  "/customers",
  "/customers/renewals",
  "/health",
  "/forecast",
  "/setup",
  "/settings",
  "/settings/team",
  "/settings/bank",
  "/settings/categories",
  "/settings/reminders",
  "/settings/health",
  "/settings/weekly-summary",
  "/settings/parallel-run",
  "/settings/audit-log",
];

test("keyboard: the first Tab offers 'Skip to content', and focus is always visible", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "keyboard flow is a desktop concern");
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money");
  // wait for the page itself, not the loading placeholder it streams in behind
  await expect(page.getByRole("heading", { level: 1, name: "Money in & out" })).toBeVisible();

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  // the next stop is a real control, with a visible outline
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { tag: el.tagName, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(["A", "BUTTON", "INPUT", "SELECT", "SUMMARY"]).toContain(outline.tag);
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("every screen loads with one page title, labelled fields, no errors, no sideways scroll", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));

  await signIn(page, "e2e-owner@example.test");
  for (const path of SCREENS) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveCount(1);
    await expect(page.getByText("This page didn't load"), path).toHaveCount(0);

    // every visible form field has a name a screen reader can read out
    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("input, select, textarea")]
        .filter((el) => el.offsetParent !== null && (el as HTMLInputElement).type !== "hidden")
        .filter((el) => {
          const labelled =
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
            el.closest("label") ||
            el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby");
          return !labelled;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unlabelled, path).toEqual([]);

    // nothing wider than the screen (no sideways scrolling on a phone)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${path} is wider than the screen`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test("an address that doesn't exist says so in plain words", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers it");
  await signIn(page, "e2e-viewer@example.test"); // signed out, every address leads to sign-in
  const res = await page.goto("/nothing-here");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("We couldn't find that page")).toBeVisible();
});
