import Link from "next/link";
import { FilterTabs } from "@/components/ui";
import { timeAgo } from "@/lib/bank/sync-status";
import { createClient } from "@/lib/supabase/server";

// Getting money into the app — typing it in, or importing a bank statement — is one blue button
// at the top of Money in & out, leading to one page with a tab for each way. Importing is how money
// gets in until the bank connects by itself, so a banner also says when the last import is a week
// old (or never).

const STALE_DAYS = 7;

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function ImportButton() {
  return (
    <Link
      href="/money/import"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-surface shadow-sm transition-colors hover:bg-brand-deep"
    >
      <UploadIcon className="size-4" />
      Import a bank statement
    </Link>
  );
}

/** The one way in: typing money in by hand, or importing a statement (a tab each). */
export function AddMoneyButton() {
  return (
    <Link
      href="/money/new"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-surface shadow-sm transition-colors hover:bg-brand-deep"
    >
      <span aria-hidden className="text-lg leading-none">
        +
      </span>
      Add money in or out
    </Link>
  );
}

const WAYS = [
  ["new", "Type it in"],
  ["import", "Import a bank statement"],
] as const;

/** Top of both pages: the same title, and a tab for each way of adding money. */
export function AddMoneyHeader({ way }: { way: (typeof WAYS)[number][0] }) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/money" className="text-sm text-muted underline underline-offset-4">
        ← Money in &amp; out
      </Link>
      <h1 className="font-display text-3xl md:text-4xl">Add money in or out</h1>
      <FilterTabs label="How to add it" value={way} options={WAYS} href={(w) => `/money/${w}`} />
    </div>
  );
}

/** Shown when no statement came in for a week: what's missing, and the button right there. */
export async function ImportReminder() {
  const supabase = await createClient();
  const [{ data: last }, { count: statementAccounts }] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select("created_at, bank_accounts!inner(source, bank_name, account_last4)")
      .eq("bank_accounts.source", "csv")
      .is("entered_by", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // accounts fed by statements; one the bank sends by itself needs none
    supabase
      .from("bank_accounts")
      .select("id", { count: "exact", head: true })
      .eq("source", "csv")
      .eq("is_active", true),
  ]);
  if (!statementAccounts) return null;
  const now = new Date();
  const at = last ? new Date(last.created_at) : null;
  if (at && now.getTime() - at.getTime() < STALE_DAYS * 86_400_000) return null;

  return (
    <section
      aria-label="Bank statement"
      className="flex flex-col gap-4 rounded-xl border border-attention/40 bg-attention-bg/50 p-5 sm:flex-row sm:items-center"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface text-attention-ink shadow-sm">
        <UploadIcon className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-attention-ink">
        <p className="font-semibold">
          {at
            ? `The last bank statement was imported ${timeAgo(at, now)}`
            : "No bank statement imported yet"}
        </p>
        <p className="text-sm">
          {at
            ? "Money that came in or went out since then isn't in this list, so totals and who-has-paid may be behind."
            : "Until one is imported, nothing from the bank is in this list."}{" "}
          Download the CSV from your internet banking and import it — it takes about a minute, and
          importing the same file twice never adds anything twice.
        </p>
      </div>
      <div className="shrink-0">
        <ImportButton />
      </div>
    </section>
  );
}
