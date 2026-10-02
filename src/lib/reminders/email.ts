// Reminders by email. The words come from templates.ts; the bill itself also carries a PDF.
// Which service actually delivers is a transport: the local Mailpit test inbox for now, a real
// provider (test mode first) once there is a key.
import type { CompanyAccount } from "@/lib/company";
import { formatRupiah } from "@/lib/money";
import { textPdf } from "@/lib/pdf";
import type { MessageChannel } from "./sender";
import { type Language, accountWarning, day, renderMessage } from "./templates";

export type Email = {
  to: { email: string; name: string };
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
};

export interface EmailTransport {
  /** Returns the provider's id for the message. */
  send(email: Email): Promise<string>;
}

/** What a message needs to know about the bill and who it goes to. */
export type BillFacts = {
  customerName: string;
  billingEmail: string | null;
  language: Language;
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string;
  /** total the bill asks for, codes included */
  amountDue: bigint;
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Plain text → simple, readable HTML: one paragraph per block, line breaks kept. */
export function textToHtml(text: string) {
  return text
    .split("\n\n")
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function invoicePdf(
  bill: BillFacts,
  money: { amountToTransfer: bigint | null; stillOwed: bigint },
  account: CompanyAccount,
) {
  const id = bill.language === "id";
  const paid = bill.amountDue - money.stillOwed;
  return textPdf([
    { text: account.companyName, size: 14, bold: true },
    { text: `${id ? "TAGIHAN" : "INVOICE"} ${bill.invoiceNumber}`, size: 20, bold: true, gapBefore: 12 },
    { text: `${id ? "Untuk" : "To"}: ${bill.customerName}`, gapBefore: 12 },
    { text: `${id ? "Tanggal" : "Issued"}: ${day(bill.issuedOn, bill.language)}` },
    { text: `${id ? "Jatuh tempo" : "Due"}: ${day(bill.dueOn, bill.language)}` },
    { text: `${id ? "Jumlah tagihan" : "Amount"}: ${formatRupiah(bill.amountDue)}`, gapBefore: 12 },
    ...(paid > 0n
      ? [
          { text: `${id ? "Sudah dibayar" : "Paid so far"}: ${formatRupiah(paid)}` },
          { text: `${id ? "Sisa" : "Still owed"}: ${formatRupiah(money.stillOwed)}` },
        ]
      : []),
    {
      text: `${id ? "Mohon transfer tepat" : "Please transfer exactly"}: ${formatRupiah(
        money.amountToTransfer ?? money.stillOwed,
      )}`,
      size: 13,
      bold: true,
      gapBefore: 12,
    },
    { text: accountWarning(account, bill.language), size: 10, gapBefore: 16 },
  ]);
}

export function emailChannel({
  transport,
  loadBill,
  account,
}: {
  transport: EmailTransport;
  loadBill: (invoiceId: string) => Promise<BillFacts>;
  account: CompanyAccount;
}): MessageChannel {
  return {
    async send(reminder) {
      const bill = await loadBill(reminder.invoice_id);
      if (!bill.billingEmail) throw new Error("This customer has no email address");

      const money = {
        amountToTransfer: reminder.amount_to_transfer ? BigInt(reminder.amount_to_transfer) : null,
        stillOwed: BigInt(reminder.still_owed),
      };
      const { subject, body } = renderMessage(
        reminder.template_key ?? "",
        bill.language,
        { ...bill, ...money, paidSoFar: bill.amountDue - money.stillOwed },
        account,
      );
      const providerMessageId = await transport.send({
        to: { email: bill.billingEmail, name: bill.customerName },
        subject,
        text: body,
        html: `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f1f1f;max-width:560px">${textToHtml(body)}</div>`,
        attachments:
          reminder.template_key === "invoice"
            ? [
                {
                  filename: `${bill.invoiceNumber}.pdf`,
                  content: invoicePdf(bill, money, account),
                  contentType: "application/pdf",
                },
              ]
            : undefined,
      });
      return { providerMessageId };
    },
  };
}

/** The local test inbox (Mailpit, part of the local Supabase stack). Development only. */
export function mailpitTransport(baseUrl: string, from: { email: string; name: string }): EmailTransport {
  return {
    async send(email) {
      const res = await fetch(`${baseUrl}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: from.email, Name: from.name },
          To: [{ Email: email.to.email, Name: email.to.name }],
          Subject: email.subject,
          Text: email.text,
          HTML: email.html,
          Attachments: email.attachments?.map((a) => ({
            Filename: a.filename,
            ContentType: a.contentType,
            Content: Buffer.from(a.content).toString("base64"),
          })),
        }),
      });
      if (!res.ok) throw new Error(`Test inbox refused the email (${res.status})`);
      return ((await res.json()) as { ID: string }).ID;
    },
  };
}
