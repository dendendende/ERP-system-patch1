import { describe, expect, it } from "vitest";
import type { CompanyAccount } from "@/lib/company";
import { type BillFacts, type Email, emailChannel, textToHtml } from "./email";
import type { ClaimedReminder } from "./sender";

const account: CompanyAccount = {
  companyName: "PT Contoh Software",
  bankName: "BCA",
  accountNumber: "1234567890",
  accountHolder: "PT Contoh Software",
};

const bill: BillFacts = {
  customerName: "PT Maju Jaya",
  billingEmail: "finance@majujaya.example",
  language: "id",
  invoiceNumber: "INV-0237",
  issuedOn: "2026-09-23",
  dueOn: "2026-10-01",
  amountDue: 4_900_000n,
};

const reminder = (template: string): ClaimedReminder => ({
  id: "r1",
  invoice_id: "inv",
  channel: "email",
  template_key: template,
  kind: template,
  scheduled_for: "2026-09-27T01:00:00Z",
  amount_to_transfer: "4900001",
  still_owed: "4900000",
});

function setup(facts: BillFacts = bill) {
  const sent: Email[] = [];
  const channel = emailChannel({
    account,
    loadBill: async () => facts,
    transport: { send: async (email) => (sent.push(email), `mail-${sent.length}`) },
  });
  return { channel, sent };
}

describe("emailChannel", () => {
  it("the bill goes to the billing email, in their language, with the PDF attached", async () => {
    const { channel, sent } = setup();
    expect(await channel.send(reminder("invoice"))).toEqual({ providerMessageId: "mail-1" });
    const [email] = sent;
    expect(email.to).toEqual({ email: "finance@majujaya.example", name: "PT Maju Jaya" });
    expect(email.subject).toBe("Tagihan INV-0237 — jatuh tempo 1 Oktober 2026");
    expect(email.text).toContain("Mohon transfer tepat Rp 4.900.001");
    expect(email.html).toContain("<p>Halo PT Maju Jaya,</p>");
    expect(email.attachments?.map((a) => [a.filename, a.contentType])).toEqual([
      ["INV-0237.pdf", "application/pdf"],
    ]);
    const pdf = Buffer.from(email.attachments![0].content).toString("latin1");
    expect(pdf).toContain("(TAGIHAN INV-0237)");
    expect(pdf).toContain("Rp 4.900.001");
    expect(pdf).toContain("BCA 1234567890");
  });

  it("reminders don't carry the PDF; English customers get English", async () => {
    const { channel, sent } = setup({ ...bill, language: "en" });
    await channel.send(reminder("overdue"));
    expect(sent[0].subject).toBe("Invoice INV-0237 is past due");
    expect(sent[0].attachments).toBeUndefined();
  });

  it("a customer with no email address fails loudly, so the timeline shows why", async () => {
    const { channel, sent } = setup({ ...bill, billingEmail: null });
    await expect(channel.send(reminder("reminder"))).rejects.toThrow(/no email address/);
    expect(sent).toEqual([]);
  });
});

describe("textToHtml", () => {
  it("escapes what the customer's name or anything else could smuggle in", () => {
    expect(textToHtml('Halo <b>"PT & Co"</b>,\nbaris dua\n\nparagraf')).toBe(
      "<p>Halo &#60;b&#62;&#34;PT &#38; Co&#34;&#60;/b&#62;,<br>baris dua</p>\n<p>paragraf</p>",
    );
  });
});
