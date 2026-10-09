"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Input, StatusPill } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { matchToInvoice, type MatchState } from "./actions";
import { useFormAction } from "@/components/use-form-action";

export type Candidate = {
  id: string;
  number: string;
  customer: string;
  owed: string;
  transferAmount: string;
  fits: boolean;
};

/** "Which bill did this transfer pay?" — the engine's own suggestions, decided by a person. */
export function MatchToInvoice({
  transactionId,
  entryId,
  amount,
  candidates,
}: {
  transactionId: string;
  entryId: string;
  amount: string;
  candidates: Candidate[];
}) {
  const [state, action, pending] = useFormAction<MatchState>(matchToInvoice, {});
  const router = useRouter();
  useEffect(() => {
    if (state.at) router.refresh();
  }, [state.at, router]);

  const best = candidates[0];
  const suggested = best ? (BigInt(best.owed) < BigInt(amount) ? best.owed : amount) : amount;

  // the section around it ("Which bill did this pay?") is the transaction's object page's
  return (
    <>
      {candidates.length ? (
        <form onSubmit={action} className="flex flex-col gap-4">
          <input type="hidden" name="transactionId" value={transactionId} />
          <input type="hidden" name="entryId" value={entryId} />
          <div className="flex flex-col gap-2" role="group" aria-label="Bills waiting for money">
            {candidates.map((c, i) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-ink"
              >
                <input type="radio" name="invoiceId" value={c.id} defaultChecked={i === 0} />
                <span className="flex-1">
                  <span className="font-medium">{c.number}</span>{" "}
                  <span className="text-muted">· {c.customer}</span>
                </span>
                {c.fits ? <StatusPill tone="in">Fits</StatusPill> : null}
                <span className="tabular-nums text-muted">
                  asks {formatRupiah(BigInt(c.transferAmount))}
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Input
              label="How much of this transfer?"
              name="amount"
              id={`amount-${transactionId}`}
              inputMode="numeric"
              defaultValue={suggested}
              className="w-48 tabular-nums"
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Matching…" : "This paid the bill"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">
          No bill is waiting for money from around this date. Write the bill first, then come back.
        </p>
      )}
      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
      {state.ok ? <StatusPill tone="in">{state.ok}</StatusPill> : null}
      <p className="text-sm text-muted">
        Matching records a payment in your name. Payments are never deleted, so a wrong match is
        corrected by matching the rest — ask the owner if a bill needs settling another way.
      </p>
    </>
  );
}
