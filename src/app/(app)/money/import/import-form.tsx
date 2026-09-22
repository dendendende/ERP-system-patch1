"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button, Card, StatusPill } from "@/components/ui";
import { TEMPLATE_CSV } from "@/lib/bank/template";
import { importStatement, type ImportState } from "./actions";

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
      <Card className="flex flex-col items-start gap-3">
        <StatusPill tone="in">Imported</StatusPill>
        <p className="text-sm">
          Added <span className="tabular-nums">{state.imported}</span> new transactions.
        </p>
        <Link href="/money" className="text-sm underline underline-offset-4">
          See money in &amp; out
        </Link>
      </Card>
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
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="text-sm font-normal"
          />
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
