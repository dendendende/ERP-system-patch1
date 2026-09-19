import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

const PAGES = [
  ["Money in & out", "/money"],
  ["Customers & billing", "/customers"],
  ["Business health", "/health"],
  ["Settings", "/settings"],
  ["Home", "/"],
] as const;

test("navigation reaches every section", async ({ page }, testInfo) => {
  // Separate users so the parallel desktop and phone runs never share 2FA state.
  await signIn(
    page,
    testInfo.project.name === "phone" ? "e2e-operator@example.test" : "e2e-owner@example.test",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();

  // Exactly one navigation is visible: the sidebar on desktop, the tab bar on phones.
  const nav = page.getByRole("navigation", { name: "Main" }).locator("visible=true");
  await expect(nav).toHaveCount(1);

  for (const [label, path] of PAGES) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
    await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  }

  // No sideways scrolling at this width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
});
