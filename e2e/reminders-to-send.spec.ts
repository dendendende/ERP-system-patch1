import { expect, test } from "@playwright/test";
import { signIn } from "./auth";
import { openCustomer } from "./open";

const CUSTOMER = "PT Karya Digital"; // has an email address

test("a due reminder waits on Home until someone sends it by hand", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop covers the flow");
  const amount = `6.${String(100 + Math.floor(Math.random() * 800))}.000`;
  await signIn(page, "e2e-operator@example.test");

  // a new bill: its own message is due right away
  await openCustomer(page, CUSTOMER);
  await page.getByLabel("Amount (Rp)").fill(amount);
  await page.getByRole("button", { name: "Write bill" }).click();
  await expect(page.getByText("Bill written.")).toBeVisible();
  const bills = page.getByRole("region", { name: "Bills" });
  const number = (
    await bills
      .locator(".rounded-xl")
      .filter({ hasText: `Rp ${amount}` })
      .first()
      .getByText(/^INV-\d+$/)
      .innerText()
  ).trim();

  // it's on Home's list, with the message ready to copy or open in email
  await page.goto("/");
  const list = page.getByRole("region", { name: "Reminders to send" });
  const item = list.locator("div.border-b").filter({ hasText: number });
  await expect(item.getByText(`Send the bill · ${CUSTOMER}`)).toBeVisible();
  await item.getByText("Read the message").click();
  await expect(
    item.getByText(/We only accept payment to|Kami hanya menerima pembayaran/),
  ).toBeVisible();
  await expect(item.getByRole("link", { name: "Open in email" })).toHaveAttribute(
    "href",
    /^mailto:ap@karyadigital\.example\?subject=/,
  );

  // the bill's PDF, to attach by hand
  const pdfHref = await item
    .getByRole("link", { name: "Download the bill (PDF)" })
    .getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // sent by hand → off the list, and the customer's timeline says so
  await item.getByRole("button", { name: "Mark as sent" }).click();
  await expect(list.locator("div.border-b").filter({ hasText: number })).toHaveCount(0);
  await openCustomer(page, CUSTOMER);
  const timeline = page.getByRole("region", { name: "What we've sent them" });
  await expect(
    timeline
      .locator("li")
      .filter({ hasText: `The bill · ${number}` })
      .getByText("Sent by hand"),
  ).toBeVisible();

  // tidy up: cancel the test bill
  const card = bills.locator(".rounded-xl").filter({ hasText: number }).first();
  await card.locator("summary").click();
  await card.getByLabel("Cancel this bill — why?").fill("End of test");
  await card.getByRole("button", { name: "Cancel bill" }).click();
  await expect(card.getByText("Cancelled")).toBeVisible();
});

test("the bill's PDF is not available to someone signed out", async ({ request }) => {
  const res = await request.get(
    "/customers/00000000-0000-0000-0000-000000000000/bills/00000000-0000-0000-0000-000000000000/pdf",
    {
      maxRedirects: 0,
    },
  );
  expect(res.status()).not.toBe(200);
  expect(res.headers()["content-type"] ?? "").not.toContain("application/pdf");
});
