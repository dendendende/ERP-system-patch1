import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// Money recorded by hand, details on what the bank doesn't say, and the statement that later
// brings the same money in: warned about, and the hand entry cancelled.
// Hand entries are removed by the e2e clean-up; the imported row stays (bank rows never go), so
// each run uses its own name and amount, on a day long past.

const RUN = Array.from(
  { length: 6 },
  () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)],
).join("");
const AMOUNT = 1_000_000 + Math.floor(Math.random() * 900_000);
const DAY = "2020-01-15";
const ACCOUNT = "BCA · PT Contoh Operasional ••1234";

test("record by hand from Home → statement warns and takes details → cancel the hand entry", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  test.setTimeout(90_000);
  await signIn(page, "e2e-operator@example.test");

  // the shortcut on Home opens the form, already on "money in"
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Add money" })
    .getByRole("link", { name: /^Money in/ })
    .click();
  await expect(page).toHaveURL(/\/money\/new\?dir=in$/);
  await expect(page.getByRole("radio", { name: "Money in" })).toBeChecked();

  await page.getByLabel("Amount (Rp)").fill(AMOUNT.toLocaleString("id-ID"));
  await page.getByLabel("Date").fill(DAY);
  await page.getByLabel("Which account did it go into?").selectOption({ label: ACCOUNT });
  await page.getByLabel("Who paid you?").fill(`E2E HAND ${RUN}`);
  await page.getByLabel("Note").fill(`Cash for invoice ${RUN}`);
  await page.getByRole("button", { name: "Save money in" }).click();
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible();

  // the list shows it as typed by hand, and the note is searchable
  await page.goto(`/money?q=${encodeURIComponent(`Cash for invoice ${RUN}`)}`);
  const list = page.getByRole("region", { name: "Transactions" });
  await expect(list.getByText("By hand")).toBeVisible();
  await expect(list.getByRole("link", { name: `E2E HAND ${RUN}` })).toBeVisible();

  // the statement brings the same money in: the check says so, and details can be added.
  // Importing is the other tab of the same "Add money in or out" page.
  await page.getByRole("link", { name: "Add money in or out" }).click();
  await page
    .getByRole("navigation", { name: "How to add it" })
    .getByRole("link", { name: "Import a bank statement" })
    .click();
  await expect(page).toHaveURL(/\/money\/import$/);
  await page.getByLabel("Bank account").selectOption({ label: ACCOUNT.replace(" ••", " · ••") });
  await page.getByLabel("Statement file (CSV)").setInputFiles({
    name: `hand-${RUN}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(`date,description,amount\n${DAY},"E2E HANDTEST CR ${RUN}",${AMOUNT}\n`),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(
    page.getByText(/1 transaction here looks like one already entered by hand/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import 1 new" }).click();
  await expect(page.getByText("Added 1 new transactions.")).toBeVisible();

  const details = page.getByRole("form", { name: "Add details" });
  await details.getByLabel(`Who, for E2E HANDTEST CR ${RUN}`).fill(`PT Hand ${RUN}`);
  await details
    .getByLabel(`Note, for E2E HANDTEST CR ${RUN}`)
    .fill("March subscription, paid in cash first");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details.getByText("Saved details for 1 transaction.")).toBeVisible();

  // the hand entry is now counted twice: cancel it from its own page
  const [handPage] = await Promise.all([
    page.context().waitForEvent("page"), // the link opens a new tab, keeping this screen
    page
      .getByRole("note")
      .getByRole("link", { name: `E2E HAND ${RUN}` })
      .click(),
  ]);
  await expect(handPage.getByText("Entered by hand", { exact: true })).toBeVisible();
  await handPage.getByRole("button", { name: "Cancel this entry" }).click();
  await expect(handPage.getByText("Cancelled — not counted in any total")).toBeVisible();

  // both are listed; the statement row carries its details
  await page.goto(`/money?q=${RUN}`);
  await expect(list.locator("tbody tr[data-row]")).toHaveCount(2);
  await expect(list.getByText(`PT Hand ${RUN}`)).toBeVisible();
});
