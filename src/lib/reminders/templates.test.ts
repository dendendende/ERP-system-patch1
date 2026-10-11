import { describe, expect, it } from "vitest";
import { type CompanyAccount, companyAccount } from "@/lib/company";
import {
  type MessageFacts,
  TEMPLATE_KEYS,
  accountWarning,
  renderMessage,
  statementMessage,
} from "./templates";

const account: CompanyAccount = {
  companyName: "PT Contoh Software",
  bankName: "BCA",
  accountNumber: "1234567890",
  accountHolder: "PT Contoh Software",
};

const facts: MessageFacts = {
  customerName: "PT Maju Jaya",
  invoiceNumber: "INV-0237",
  amountToTransfer: 4_900_001n,
  stillOwed: 4_900_000n,
  paidSoFar: 0n,
  dueOn: "2026-10-01",
};

describe("every template, in both languages", () => {
  for (const key of TEMPLATE_KEYS) {
    for (const lang of ["id", "en"] as const) {
      it(`${key} (${lang}) carries the fixed account and the warning`, () => {
        const { subject, body } = renderMessage(key, lang, facts, account);
        expect(subject).toContain("INV-0237");
        expect(body).toContain("PT Maju Jaya");
        expect(body).toContain(accountWarning(account, lang));
        expect(body).toContain("BCA 1234567890");
      });
    }
  }

  it("the warning says exactly what the plan asks for", () => {
    expect(accountWarning(account, "en")).toBe(
      "We only accept payment to BCA 1234567890 (PT Contoh Software). We will never change it by message.",
    );
    expect(accountWarning(account, "id")).toBe(
      "Kami hanya menerima pembayaran ke rekening BCA 1234567890 a.n. PT Contoh Software. Nomor rekening ini tidak akan pernah kami ubah melalui pesan.",
    );
  });
});

describe("what the messages ask for", () => {
  it("asks for the exact unique amount, with the due date in the customer's language", () => {
    expect(renderMessage("invoice", "en", facts, account).body).toContain(
      "Please transfer exactly Rp 4.900.001",
    );
    const id = renderMessage("reminder", "id", facts, account);
    expect(id.body).toContain("Mohon transfer tepat Rp 4.900.001");
    expect(id.subject).toBe("Pengingat: tagihan INV-0237 jatuh tempo 1 Oktober 2026");
  });

  it("a partly paid bill says what arrived, what is left, and the new amount to transfer", () => {
    const part = {
      ...facts,
      paidSoFar: 2_000_000n,
      stillOwed: 2_900_000n,
      amountToTransfer: 2_900_017n,
    };
    const { body } = renderMessage("overdue", "en", part, account);
    expect(body).toContain("we have received Rp 2.000.000. Rp 2.900.000 is still owed.");
    expect(body).toContain("Please transfer exactly Rp 2.900.017");
  });

  it("the thank-you asks for nothing", () => {
    const paid = { ...facts, amountToTransfer: null, stillOwed: 0n, paidSoFar: 4_900_001n };
    const { body } = renderMessage("thank_you", "id", paid, account);
    expect(body).toContain("sudah kami terima. Terima kasih!");
    expect(body).not.toContain("Mohon transfer");
  });

  it("refuses a template that doesn't exist", () => {
    expect(() => renderMessage("promo", "en", facts, account)).toThrow(/No template/);
  });
});

describe("the company account comes from config only", () => {
  const env = {
    COMPANY_NAME: "PT Contoh",
    COMPANY_BANK_NAME: "BCA",
    COMPANY_ACCOUNT_NUMBER: "1234567890",
    COMPANY_ACCOUNT_HOLDER: "PT Contoh",
  };

  it("reads it from the environment", () => {
    expect(companyAccount(env).accountNumber).toBe("1234567890");
  });

  it("refuses to work when any part is missing or the number isn't digits", () => {
    expect(() => companyAccount({ ...env, COMPANY_ACCOUNT_NUMBER: "" })).toThrow(
      /COMPANY_ACCOUNT_NUMBER/,
    );
    expect(() => companyAccount({ ...env, COMPANY_ACCOUNT_NUMBER: "123-456-7890" })).toThrow(
      /digits only/,
    );
  });
});

describe("the message sent with a customer statement", () => {
  const facts = {
    customerName: "PT Maju Jaya",
    from: "2026-08-01",
    to: "2026-10-11",
    owed: 4_900_000n,
  };

  it("says what is still owed, without one total to transfer, and carries the fixed account", () => {
    const { subject, body } = statementMessage("id", facts, account);
    expect(subject).toBe("Laporan tagihan PT Contoh Software, 1 Agustus 2026 – 11 Oktober 2026");
    expect(body).toContain("Halo PT Maju Jaya,");
    expect(body).toContain("Sisa tagihan per 11 Oktober 2026: Rp");
    expect(body).toContain("sesuai jumlah di setiap tagihan"); // each bill has its own code
    expect(body).toContain(accountWarning(account, "id"));
  });

  it("thanks them when nothing is owed, in English for English customers", () => {
    const { subject, body } = statementMessage("en", { ...facts, owed: 0n }, account);
    expect(subject).toBe("Statement from PT Contoh Software, 1 August 2026 – 11 October 2026");
    expect(body).toContain("Everything is paid. Thank you!");
    expect(body).not.toContain("Still owed");
    expect(body).toContain(accountWarning(account, "en"));
  });
});
