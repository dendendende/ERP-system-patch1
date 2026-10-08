"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button, Card, Money, StatusPill } from "@/components/ui";
import { TEMPLATE_CSV } from "@/lib/bank/template";
import {
  type DetailsState,
  type ImportState,
  type ImportedRow,
  importStatement,
  saveImportDetails,
} from "./actions";

type Account = { id: string; bank_name: string; account_name: string; account_last4: string };

export function ImportForm({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importStatement, {});
  const p = state.preview;

  // Not <form action>: React clears a form after an action, which would drop the chosen file
  // between "Check file" and "Import". Submitting by hand keeps it.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => action(data));
  }

  if (state.imported !== undefined) {
    return (
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col items-start gap-3">
          <StatusPill tone="in">Imported</StatusPill>
          <p className="text-sm">
            Added <span className="tabular-nums">{state.imported}</span> new transactions.
          </p>
          <Link href="/money" className="text-sm underline underline-offset-4">
            See money in &amp; out
          </Link>
        </Card>
        {state.typedByHand?.length ? <TypedByHand entries={state.typedByHand} after /> : null}
        {state.rows?.length ? (
          <ImportDetails rows={state.rows} more={state.imported - state.rows.length} />
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Bank account
          <select
            name="accountId"
            required
            className="h-10 rounded-lg border border-line bg-surface px-3 font-normal"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank_name} · {a.account_name} · ••{a.account_last4}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Statement file (CSV)
          {/* the browser's own file box, made to look like what it is: a button and a drop area */}
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-brand/40 bg-brand-soft/50 p-4 text-sm font-normal text-muted transition-colors file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-surface file:shadow-sm file:transition-colors hover:border-brand hover:bg-brand-soft hover:file:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
          <span className="text-xs font-normal text-muted">
            Click the blue button to choose the file, or drop it on the box.
          </span>
        </label>
        <p className="text-sm text-muted">
          Until your bank&apos;s own format is supported, use{" "}
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
            download="statement-template.csv"
            className="underline underline-offset-4"
          >
            this template
          </a>
          : one row per transfer, amount positive for money in and negative for money out.
        </p>
      </Card>

      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}

      {p ? (
        <Card className="flex flex-col gap-3" aria-live="polite">
          <p className="text-sm font-medium">{p.fileName}</p>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {[
              ["New", p.fresh],
              ["Already imported", p.duplicates],
              ["Can't read", p.errors.length],
            ].map(([label, n]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="font-display text-2xl tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          {p.typedByHand.length ? <TypedByHand entries={p.typedByHand} /> : null}
          {p.errors.length ? (
            <div className="flex flex-col gap-1 text-sm">
              <p className="text-problem">
                Fix these rows and choose the file again. Nothing is imported while rows can&apos;t
                be read.
              </p>
              <ul className="list-inside list-disc text-muted">
                {p.errors.slice(0, 20).map((e) => (
                  <li key={e.line}>
                    Row {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" name="mode" value="preview" variant="secondary" disabled={pending}>
          {pending ? "Checking…" : "Check file"}
        </Button>
        {p && p.fresh > 0 && p.errors.length === 0 ? (
          <Button type="submit" name="mode" value="import" disabled={pending}>
            Import {p.fresh} new
          </Button>
        ) : null}
      </div>
    </form>
  );
}

const shortDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
});

/** Money typed in by hand that this statement brings in again: cancel those, or it counts twice. */
function TypedByHand({
  entries,
  after,
}: {
  entries: NonNullable<ImportState["typedByHand"]>;
  after?: boolean;
}) {
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-lg bg-attention-bg px-4 py-3 text-sm text-attention-ink"
    >
      <p className="font-medium">
        {entries.length === 1
          ? "1 transaction here looks like one already entered by hand"
          : `${entries.length} transactions here look like ones already entered by hand`}{" "}
        (same amount, same day).
      </p>
      <p>
        {after
          ? "Now that the statement is in, open each one and cancel it, so the money isn't counted twice:"
          : "After importing, cancel the hand entries so the money isn't counted twice:"}
      </p>
      <ul className="flex flex-col gap-1">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular-nums">
              {shortDay.format(new Date(`${e.day}T12:00:00+07:00`))}
            </span>
            <Money amount={BigInt(e.amount)} direction={e.direction as "in" | "out"} />
            <Link href={`/money/${e.id}`} target="_blank" className="underline underline-offset-4">
              {e.description}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Right after an import: say who each transfer was from or to, and what for. All optional. */
function ImportDetails({ rows, more }: { rows: ImportedRow[]; more: number }) {
  const [state, action, pending] = useActionState<DetailsState, FormData>(saveImportDetails, {});
  // keep what was typed on screen after saving (React would empty a <form action>)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }
  const input =
    "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm transition-colors placeholder:text-muted hover:border-muted/50";
  return (
    <form onSubmit={submit} aria-label="Add details" className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-xl">Add details (optional)</h2>
        <p className="text-sm text-muted">
          Bank statements often don&apos;t say who the money came from or what it was for. Fill in
          what you know; anything left empty can be added later from the transaction itself.
        </p>
      </div>
      <input type="hidden" name="ids" value={rows.map((r) => r.id).join(",")} />
      <Card className="p-0">
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid gap-2 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center"
          >
            <div className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="shrink-0 text-muted tabular-nums">
                {shortDay.format(new Date(r.occurred_at))}
              </span>
              <span className="min-w-0 truncate" title={r.description_raw}>
                {r.description_raw}
              </span>
              <Money
                amount={BigInt(r.amount)}
                direction={r.direction as "in" | "out"}
                className="ml-auto shrink-0"
              />
            </div>
            <input
              name={`who-${r.id}`}
              maxLength={200}
              aria-label={`Who, for ${r.description_raw}`}
              placeholder={r.direction === "in" ? "Who paid?" : "Who was paid?"}
              className={input}
            />
            <input
              name={`note-${r.id}`}
              maxLength={500}
              aria-label={`Note, for ${r.description_raw}`}
              placeholder="What for?"
              className={input}
            />
          </div>
        ))}
      </Card>
      {more > 0 ? (
        <p className="text-sm text-muted">
          Showing the first {rows.length}. The other {more} can be filled in from Money in &amp;
          out.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        {state.saved ? (
          <p role="status" className="text-sm text-in">
            Saved details for {state.saved} {state.saved === 1 ? "transaction" : "transactions"}.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm text-problem">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
