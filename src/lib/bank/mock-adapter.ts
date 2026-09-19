// Fake bank for development and tests. Deterministic: the same account and day always produce
// the same transactions and ids, like a real bank feed re-read on every sync.
import { type BankAccountRef, type BankSourceAdapter, type BankTx, jakartaDay } from "./adapter";

const EPOCH = "2026-01-01";
const OPENING_BALANCE = 250_000_000n;
const CUSTOMERS = [
  "PT MAJU JAYA",
  "CV SINAR ABADI",
  "PT KARYA DIGITAL",
  "PT NUSANTARA SOFT",
  "TOKO BERKAH",
];
const PLANS = [1_500_000n, 2_750_000n, 4_900_000n];

// mulberry32 seeded from a string: tiny, fast, deterministic
function rng(seed: string) {
  let h = 1779033703;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Draft = { direction: "in" | "out"; amount: bigint; description: string };

function draftsFor(accountId: string, day: string): Draft[] {
  const r = rng(`${accountId}|${day}`);
  const dom = Number(day.slice(8, 10));
  const lastDom = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7), 0)).getUTCDate();
  const drafts: Draft[] = [];

  const payments = Math.floor(r() * 3); // 0–2 customer payments a day
  for (let i = 0; i < payments; i++) {
    const customer = CUSTOMERS[Math.floor(r() * CUSTOMERS.length)];
    // plan price + a unique 1–999 rupiah suffix, like the unique-amount invoices in phase 2
    const amount = PLANS[Math.floor(r() * PLANS.length)] + BigInt(1 + Math.floor(r() * 999));
    drafts.push({
      direction: "in",
      amount,
      description: `TRSF E-BANKING CR ${day.slice(5).replace("-", "")}/FTSCY/WS9${Math.floor(r() * 9000 + 1000)} ${customer}`,
    });
  }
  if (dom === 1)
    drafts.push({
      direction: "out",
      amount: 12_000_000n,
      description: "SEWA KANTOR GEDUNG MENARA",
    });
  if (dom === 5) {
    drafts.push({
      direction: "out",
      amount: 3_200_000n + BigInt(Math.floor(r() * 400_000)),
      description: "AMAZON WEB SERVICES AWS.AMAZON.CO",
    });
  }
  if (dom === 10)
    drafts.push({ direction: "out", amount: 550_000n, description: "INDIHOME TELKOM INTERNET" });
  if (dom === 25)
    drafts.push({
      direction: "out",
      amount: 45_000_000n,
      description: "TRF KE PAYROLL GAJI KARYAWAN",
    });
  if (r() < 0.2) {
    drafts.push({
      direction: "out",
      amount: BigInt(20_000 + Math.floor(r() * 180) * 1_000),
      description: "QRIS TOKO ATK SEJAHTERA",
    });
  }
  if (dom === lastDom) drafts.push({ direction: "out", amount: 15_000n, description: "BIAYA ADM" });
  return drafts;
}

function* days(from: string, to: string) {
  for (
    let d = new Date(`${from}T00:00:00Z`);
    jakartaDay(d) <= to;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    yield d.toISOString().slice(0, 10);
  }
}

export class MockAdapter implements BankSourceAdapter {
  constructor(private now: () => Date = () => new Date()) {}

  // Replays every day since EPOCH up to now, so balance_after is a consistent running balance
  // and fetchBalance() matches the last visible transaction.
  private ledger(account: BankAccountRef): { tx: BankTx[]; balance: bigint } {
    const now = this.now().getTime();
    let balance = OPENING_BALANCE;
    const tx: BankTx[] = [];
    for (const day of days(EPOCH, jakartaDay(this.now()))) {
      draftsFor(account.id, day).forEach((d, i) => {
        const occurredAt = `${day}T09:${String(i * 7).padStart(2, "0")}:00+07:00`;
        if (Date.parse(occurredAt) > now) return;
        balance += d.direction === "in" ? d.amount : -d.amount;
        tx.push({
          externalId: `mock-${day}-${i}`,
          occurredAt,
          amount: d.amount,
          direction: d.direction,
          description: d.description,
          balanceAfter: balance,
        });
      });
    }
    return { tx, balance };
  }

  async fetchTransactions(account: BankAccountRef, since: Date) {
    return this.ledger(account).tx.filter((t) => Date.parse(t.occurredAt) >= since.getTime());
  }

  async fetchBalance(account: BankAccountRef) {
    return this.ledger(account).balance;
  }
}
