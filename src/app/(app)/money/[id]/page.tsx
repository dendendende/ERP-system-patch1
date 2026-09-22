import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, StatusPill } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { updateEntry } from "./actions";
import { History } from "./history";
import { type Candidate, MatchToInvoice } from "./match-form";

export const metadata = { title: "Transaction · Cashflow" };

const jakarta = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  dateStyle: "full",
});

const STATUS: Record<string, { label: string; tone: "neutral" | "attention" | "in" }> = {
  needs_label: { label: "Needs label", tone: "attention" },
  auto: { label: "Labelled by a rule", tone: "neutral" },
  labelled: { label: "Labelled by someone", tone: "in" },
};

export default async function TransactionPage({ params }: PageProps<"/money/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tx } = await supabase
    .from("bank_transactions")
    .select(
      `id, occurred_at, amount::text, direction, description_raw, balance_after::text, external_id, created_at,
       bank_accounts!inner (bank_name, account_name, account_last4, source),
       entries!inner (id, status, note, is_recurring, category_id, invoice_id, categories (name)),
       payments (id, amount_applied::text, method, invoices (number))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!tx) notFound();

  const entry = tx.entries;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: categories }, { data: me }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("type", tx.direction).order("name"),
    // my own row: everyone can see the whole team, so ask for this user explicitly
    supabase
      .from("users")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);
  const canEdit = me?.role === "owner" || me?.role === "operator";
  const isIn = tx.direction === "in";

  // Money coming in that hasn't been matched yet: offer the bills it could belong to.
  let candidates: Candidate[] = [];
  if (isIn && canEdit && tx.payments.length === 0) {
    const [{ data: fits }, { data: waiting }] = await Promise.all([
      supabase.rpc("invoice_candidates", { p_bank_transaction_id: tx.id }),
      supabase
        .from("invoices")
        .select("id, number, amount_due::text, transfer_amount::text, customers (name), payments (amount_applied::text)")
        .in("status", ["open", "partly_paid"])
        .order("due_on")
        .limit(50),
    ]);
    const strong = new Set((fits ?? []).filter((f) => f.strong).map((f) => f.invoice_id));
    candidates = (waiting ?? [])
      .map((i) => ({
        id: i.id,
        number: i.number,
        customer: i.customers?.name ?? "",
        owed: (
          BigInt(i.amount_due) -
          i.payments.reduce((total, p) => total + BigInt(p.amount_applied), 0n)
        ).toString(),
        transferAmount: i.transfer_amount ?? i.amount_due,
        fits: strong.has(i.id),
      }))
      // the ones the engine thinks fit go first, then whatever is due soonest
      .sort((a, b) => Number(b.fits) - Number(a.fits))
      .slice(0, 8);
  }
  const status = STATUS[entry.status] ?? STATUS.needs_label;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/money" className="text-sm text-muted underline underline-offset-4">
        ← Money in &amp; out
      </Link>

      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">{jakarta.format(new Date(tx.occurred_at))}</p>
        <p className={`font-display text-4xl tabular-nums ${isIn ? "text-in" : ""}`}>
          {isIn ? "+" : "−"}
          {formatRupiah(BigInt(tx.amount)).replace("−", "")}
        </p>
        <p className="text-lg">{tx.description_raw}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          {entry.categories ? <StatusPill>{entry.categories.name}</StatusPill> : null}
          {entry.is_recurring ? <StatusPill>Repeats</StatusPill> : null}
        </div>
      </header>

      {candidates.length || (isIn && canEdit && tx.payments.length === 0) ? (
        <MatchToInvoice
          transactionId={tx.id}
          entryId={entry.id}
          amount={tx.amount}
          candidates={candidates}
        />
      ) : null}

      {tx.payments.length ? (
        <Card className="flex flex-col gap-2">
          <h2 className="font-display text-xl">Paid a bill</h2>
          {tx.payments.map((p) => (
            <p key={p.id} className="text-sm">
              <span className="tabular-nums">{formatRupiah(BigInt(p.amount_applied))}</span> of
              this transfer paid {p.invoices?.number}
              {p.method === "auto" ? " — matched by the app" : " — matched by someone"}
            </p>
          ))}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-xl">Label</h2>
        {canEdit ? (
          <form action={updateEntry} className="flex flex-col gap-4">
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="transactionId" value={tx.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              What was this for?
              <select
                name="categoryId"
                // remount after a save so the box shows the saved value, not the old one
                key={entry.category_id ?? "none"}
                defaultValue={entry.category_id ?? ""}
                className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal"
              >
                <option value="">Not labelled yet</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Note
              <input
                name="note"
                key={entry.note}
                defaultValue={entry.note}
                maxLength={500}
                placeholder="Anything the team should know"
                className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal"
              />
            </label>
            <Button type="submit" className="self-start">
              Save
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <p>{entry.categories?.name ?? "Not labelled yet"}</p>
            {entry.note ? <p className="text-muted">{entry.note}</p> : null}
            <p className="text-muted">You can look, but only the team can change labels.</p>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Straight from the bank</h2>
        <p className="text-sm text-muted">
          This is exactly what the bank sent. It can never be edited — corrections go on the label
          above.
        </p>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {[
            [
              "Account",
              `${tx.bank_accounts.bank_name} · ${tx.bank_accounts.account_name} ••${tx.bank_accounts.account_last4}`,
            ],
            [
              "Came from",
              tx.bank_accounts.source === "csv" ? "Imported statement" : "Bank connection",
            ],
            ["Description", tx.description_raw],
            ["Direction", isIn ? "Money in" : "Money out"],
            ["Amount", formatRupiah(BigInt(tx.amount))],
            [
              "Balance after",
              tx.balance_after ? formatRupiah(BigInt(tx.balance_after)) : "Not given",
            ],
            ["Bank's own id", tx.external_id],
            ["First seen", jakarta.format(new Date(tx.created_at))],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="tabular-nums break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <History entryId={entry.id} />
    </div>
  );
}
