// What each reminder says, in Bahasa Indonesia and English. Plain words, one clear ask, and
// always the same fixed account with the same warning — the account comes from config
// (companyAccount), never from the reminder or the database.
import type { CompanyAccount } from "@/lib/company";
import { formatRupiah } from "@/lib/money";

export type Language = "id" | "en";
export const TEMPLATE_KEYS = [
  "invoice",
  "reminder",
  "due_tomorrow",
  "overdue",
  "thank_you",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type MessageFacts = {
  customerName: string;
  invoiceNumber: string;
  /** exact amount to transfer now (with its unique code); null once paid */
  amountToTransfer: bigint | null;
  /** what is left of the bill */
  stillOwed: bigint;
  /** already paid towards it (partly paid bills say so) */
  paidSoFar: bigint;
  /** YYYY-MM-DD */
  dueOn: string;
};

export type Message = { subject: string; body: string };

/** "1 Oktober 2026" / "1 October 2026" — a date column read as that day in Jakarta. */
export function day(date: string, lang: Language) {
  return new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

/** The line every message ends with. */
export function accountWarning(account: CompanyAccount, lang: Language) {
  const where = `${account.bankName} ${account.accountNumber} a.n. ${account.accountHolder}`;
  return lang === "id"
    ? `Kami hanya menerima pembayaran ke rekening ${where}. Nomor rekening ini tidak akan pernah kami ubah melalui pesan.`
    : `We only accept payment to ${account.bankName} ${account.accountNumber} (${account.accountHolder}). We will never change it by message.`;
}

export function renderMessage(
  key: string,
  lang: Language,
  facts: MessageFacts,
  account: CompanyAccount,
): Message {
  if (!(TEMPLATE_KEYS as readonly string[]).includes(key)) throw new Error(`No template "${key}"`);
  const f = facts;
  const due = day(f.dueOn, lang);
  const left = formatRupiah(f.stillOwed);
  const paid = formatRupiah(f.paidSoFar);
  const partly = f.paidSoFar > 0n && f.stillOwed > 0n;
  const exact = f.amountToTransfer === null ? left : formatRupiah(f.amountToTransfer);

  const id = {
    greet: `Halo ${f.customerName},`,
    ask: `Mohon transfer tepat ${exact} — tiga angka terakhir membantu kami mengenali pembayaran Anda.`,
    partly: `Terima kasih, ${paid} sudah kami terima. Sisa tagihan ${left}.`,
  };
  const en = {
    greet: `Hello ${f.customerName},`,
    ask: `Please transfer exactly ${exact} — the last three digits tell us the payment is yours.`,
    partly: `Thank you, we have received ${paid}. ${left} is still owed.`,
  };
  const t = lang === "id" ? id : en;

  const lines: Record<TemplateKey, { subject: string; lines: string[] }> =
    lang === "id"
      ? {
          invoice: {
            subject: `Tagihan ${f.invoiceNumber} — jatuh tempo ${due}`,
            lines: [`Berikut tagihan ${f.invoiceNumber}, jatuh tempo ${due}.`, t.ask],
          },
          reminder: {
            subject: `Pengingat: tagihan ${f.invoiceNumber} jatuh tempo ${due}`,
            lines: [`Tagihan ${f.invoiceNumber} jatuh tempo ${due}.`, t.ask],
          },
          due_tomorrow: {
            subject: `Tagihan ${f.invoiceNumber} jatuh tempo besok`,
            lines: [`Tagihan ${f.invoiceNumber} jatuh tempo besok, ${due}.`, t.ask],
          },
          overdue: {
            subject: `Tagihan ${f.invoiceNumber} sudah lewat jatuh tempo`,
            lines: [
              `Tagihan ${f.invoiceNumber} sudah lewat jatuh tempo (${due}) dan belum kami terima.`,
              t.ask,
              "Jika sudah membayar, mohon abaikan pesan ini — terima kasih.",
            ],
          },
          thank_you: {
            subject: `Pembayaran ${f.invoiceNumber} sudah kami terima`,
            lines: [`Pembayaran untuk tagihan ${f.invoiceNumber} sudah kami terima. Terima kasih!`],
          },
        }
      : {
          invoice: {
            subject: `Invoice ${f.invoiceNumber} — due ${due}`,
            lines: [`Here is invoice ${f.invoiceNumber}, due ${due}.`, t.ask],
          },
          reminder: {
            subject: `Reminder: invoice ${f.invoiceNumber} is due ${due}`,
            lines: [`Invoice ${f.invoiceNumber} is due ${due}.`, t.ask],
          },
          due_tomorrow: {
            subject: `Invoice ${f.invoiceNumber} is due tomorrow`,
            lines: [`Invoice ${f.invoiceNumber} is due tomorrow, ${due}.`, t.ask],
          },
          overdue: {
            subject: `Invoice ${f.invoiceNumber} is past due`,
            lines: [
              `Invoice ${f.invoiceNumber} was due ${due} and we haven't received it yet.`,
              t.ask,
              "If you have already paid, please ignore this message — thank you.",
            ],
          },
          thank_you: {
            subject: `Payment for ${f.invoiceNumber} received`,
            lines: [`We have received the payment for invoice ${f.invoiceNumber}. Thank you!`],
          },
        };

  const chosen = lines[key as TemplateKey];
  const body = [
    t.greet,
    "",
    // a partly paid bill says what arrived and what is left, before asking for the rest
    ...(partly && key !== "thank_you" ? [t.partly] : []),
    ...chosen.lines,
    "",
    accountWarning(account, lang),
    "",
    account.companyName,
  ].join("\n");
  return { subject: chosen.subject, body };
}

/**
 * The message that goes with a customer statement (the PDF is attached by hand). It doesn't ask
 * for the total: each bill has its own exact amount to transfer (its unique code).
 */
export function statementMessage(
  lang: Language,
  facts: { customerName: string; from: string; to: string; owed: bigint },
  account: CompanyAccount,
): Message {
  const [from, to] = [day(facts.from, lang), day(facts.to, lang)];
  const owed = formatRupiah(facts.owed);
  const t =
    lang === "id"
      ? {
          subject: `Laporan tagihan ${account.companyName}, ${from} – ${to}`,
          greet: `Halo ${facts.customerName},`,
          lines: [
            `Terlampir laporan tagihan Anda untuk ${from} sampai ${to}.`,
            facts.owed > 0n
              ? `Sisa tagihan per ${to}: ${owed}. Mohon transfer tepat sesuai jumlah di setiap tagihan.`
              : "Semua tagihan sudah lunas. Terima kasih!",
          ],
        }
      : {
          subject: `Statement from ${account.companyName}, ${from} – ${to}`,
          greet: `Hello ${facts.customerName},`,
          lines: [
            `Attached is your statement for ${from} to ${to}.`,
            facts.owed > 0n
              ? `Still owed on ${to}: ${owed}. Please transfer the exact amount shown on each bill.`
              : "Everything is paid. Thank you!",
          ],
        };
  const body = [
    t.greet,
    "",
    ...t.lines,
    "",
    accountWarning(account, lang),
    "",
    account.companyName,
  ];
  return { subject: t.subject, body: body.join("\n") };
}
