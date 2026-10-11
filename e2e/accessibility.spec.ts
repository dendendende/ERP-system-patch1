import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// P6-T5: keyboard use, and a sweep over every screen.
const SCREENS = [
  "/",
  "/money",
  "/money/import",
  "/money/regular-costs",
  "/customers",
  "/customers/bills",
  "/customers/renewals",
  "/health",
  "/reports",
  "/notifications",
  "/reports?report=revenue_by_plan",
  "/reports?report=cashflow",
  "/reports?report=aging_detail",
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

// P9-T8: what a person reading, tabbing or listening meets on every screen, measured in the
// browser as drawn (so see-through colours, faded parts and new screens are all covered):
// - text contrast: WCAG AA, 4.5:1 (3:1 for large text), against what is really behind it
// - every link, button and tick box has a name a screen reader can say
// - every chart or picture is either described (role="img" + label, or a labelled figure) or
//   hidden from screen readers because the words next to it already say it
type Problem = string;
function sweep(): Problem[] {
  const problems: Problem[] = [];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // any CSS colour (oklab, color-mix…) → [r, g, b, a] in sRGB, as the browser paints it
  const rgba = (css: string): number[] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top: number[], bottom: number[]) =>
    [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const lum = (c: number[]) =>
    c
      .slice(0, 3)
      .map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // on screen now (not inside a closed <details>, not display:none or visibility:hidden)
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && el.checkVisibility({ visibilityProperty: true });
  };
  const where = (el: Element) => `"${(el.textContent ?? "").trim().slice(0, 40)}" <${el.tagName}>`;

  // what's behind an element: its own and its ancestors' backgrounds, see-through ones blended,
  // and how faded it is. null: a gradient or picture is behind it (those are checked by hand).
  const behind = (el: Element) => {
    let opacity = 1;
    const layers: number[][] = [];
    for (let a: Element | null = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      opacity *= Number(s.opacity);
      if (s.backgroundImage !== "none") return null;
      const bg = rgba(s.backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] === 1) break;
    }
    const bg = layers.reduceRight((under, layer) => over(layer, under), [255, 255, 255, 1]);
    return { bg, opacity };
  };

  // contrast: each element that holds text itself
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!own || !shown(el) || el.closest("[disabled], [aria-disabled='true'], .sr-only, svg"))
      continue;
    const b = behind(el);
    if (!b || b.opacity < 0.05) continue; // hidden until hovered: decoration only
    const color = rgba(getComputedStyle(el).color);
    const fg = over([...color.slice(0, 3), color[3] * b.opacity], b.bg);
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const r = ratio(fg, b.bg);
    if (r < (large ? 3 : 4.5)) problems.push(`contrast ${r.toFixed(2)}: ${where(el)}`);
  }

  // names: what a screen reader announces for each control
  for (const el of document.body.querySelectorAll<HTMLElement>(
    "a[href], button, summary, [role='button'], [role='link'], [role='tab']",
  )) {
    if (!shown(el) || el.closest("[aria-hidden='true']")) continue;
    const labelledBy = el
      .getAttribute("aria-labelledby")
      ?.split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join("");
    const name =
      el.getAttribute("aria-label") ||
      labelledBy ||
      el.innerText.trim() ||
      el.getAttribute("title") ||
      el.querySelector("img[alt]")?.getAttribute("alt") ||
      el.querySelector("svg[aria-label]")?.getAttribute("aria-label");
    if (!name?.trim()) problems.push(`no name: ${el.outerHTML.slice(0, 100)}`);
  }

  // focus: everything the keyboard reaches (list rows too) shows a clear outline when it does
  const before = document.activeElement as HTMLElement | null;
  for (const el of document.body.querySelectorAll<HTMLElement>(
    "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex], tr[data-row]",
  )) {
    if (!shown(el) || el.closest("[inert]") || (el as HTMLButtonElement).disabled) continue;
    el.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
    if (document.activeElement !== el) continue;
    for (const a of el.getAnimations()) a.finish(); // read the ring as it ends up, not mid-fade
    const s = getComputedStyle(el);
    const ring = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
    if (!ring && el.tagName !== "MAIN") problems.push(`no focus outline: ${where(el)}`);
    // the outline sits around it, on what's behind it: 3:1 against that (WCAG non-text contrast)
    const around = ring && el.parentElement ? behind(el.parentElement) : null;
    const ringRatio = around ? ratio(rgba(s.outlineColor), around.bg) : 21;
    if (ringRatio < 3) problems.push(`focus outline ${ringRatio.toFixed(2)}:1: ${where(el)}`);
  }
  before?.focus({ preventScroll: true });

  // pictures: described, or hidden as decoration
  for (const svg of document.body.querySelectorAll("svg")) {
    if (svg.closest("[aria-hidden='true']") || !shown(svg)) continue;
    const named = svg.getAttribute("role") === "img" && svg.getAttribute("aria-label");
    const inNamed = svg.parentElement?.closest("[aria-label]");
    if (!named && !inNamed) problems.push(`picture without words: ${where(svg.parentElement!)}`);
  }
  for (const fig of document.body.querySelectorAll("figure")) {
    if (
      !fig.getAttribute("aria-label") &&
      !fig.getAttribute("aria-labelledby") &&
      !fig.querySelector("figcaption")
    )
      problems.push(`chart without a name: ${where(fig)}`);
  }
  return problems;
}

test("every screen: readable text, named controls, described charts", async ({ page }) => {
  test.setTimeout(180_000);
  // no entrance animation mid-measure (and the reduced-motion setting is honoured: see below)
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "e2e-owner@example.test");
  const found: string[] = [];
  for (const path of [...SCREENS, "/?vs=month", "/money?vs=year", "/customers/bills?vs=month"]) {
    await page.goto(path);
    await expect(page.locator("h1"), path).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    found.push(...(await page.evaluate(sweep)).map((p) => `${path} · ${p}`));
  }
  expect([...new Set(found)]).toEqual([]);
});

test("the same, with rows ticked, a row open beside the list, and the find box open", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money");
  const table = page.getByRole("table", { name: "Transactions matching the filters" });
  await table.getByRole("checkbox", { name: "Tick this row" }).first().check();
  await expect(page.getByRole("region", { name: "Ticked rows" })).toBeVisible();
  const ticked = await page.evaluate(sweep);

  // by keyboard (on a phone the tab bar sits over where Playwright scrolls things to)
  await page.getByRole("button", { name: "Untick all" }).press("Enter");
  await table.locator("tbody tr[data-row]").first().getByRole("link").first().press("Enter");
  await expect(page).toHaveURL(/[?&]open=/);
  await expect(page.getByRole("complementary").last()).toBeVisible();
  await page.waitForLoadState("networkidle");
  const open = await page.evaluate(sweep);

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Find or jump to" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("a");
  await page.waitForLoadState("networkidle");
  const find = await page.evaluate(sweep);

  expect({ ticked, open, find }).toEqual({ ticked: [], open: [], find: [] });
});

test("with reduced motion asked for, nothing slides or fades", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers it");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "e2e-owner@example.test");
  await page.goto("/money");
  await expect(page.getByRole("heading", { level: 1, name: "Money in & out" })).toBeVisible();
  const moving = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>("*")]
        .map((el) => getComputedStyle(el))
        .filter(
          (s) =>
            parseFloat(s.animationDuration) > 0.001 ||
            s.transitionDuration.split(",").some((d) => parseFloat(d) > 0.001),
        ).length,
  );
  expect(moving).toBe(0);
});
