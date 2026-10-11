"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { bulkLabel, bulkRemind, bulkRemindCustomers, bulkVoid } from "./bulk-actions";

// What the bar under a list offers for the ticked rows (P9-T4). Each one runs, says how it went
// above the list, unticks and refreshes; when the database refuses, the ticks stay to retry.

const field = "h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink";

type Outcome = { said?: string; error?: string };

function useBulk(clear: () => void, say: (words: string) => void) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (action: () => Promise<Outcome>) =>
    start(async () => {
      const r = await action();
      say(r.error ?? r.said ?? "");
      if (!r.error) {
        clear();
        router.refresh();
      }
    });
  return { pending, run };
}

export type LabelCategory = { id: string; name: string; type: string };

/** Money in & out: one category for all ticked. Only the categories that fit what's ticked. */
export function LabelBar({
  ticked,
  categories,
  clear,
  say,
}: {
  ticked: { id: string; direction: string }[];
  categories: LabelCategory[];
  clear: () => void;
  say: (words: string) => void;
}) {
  const { pending, run } = useBulk(clear, say);
  const [category, setCategory] = useState("");
  const directions = new Set(ticked.map((t) => t.direction));
  const fits = (type: string) => directions.size !== 1 || directions.has(type);
  const group = (type: string, label: string) =>
    fits(type) ? (
      <optgroup label={label}>
        {categories
          .filter((c) => c.type === type)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </optgroup>
    ) : null;

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          bulkLabel(
            ticked.map((t) => t.id),
            category,
          ),
        );
      }}
    >
      <label className="flex items-center gap-2">
        Label as
        <select
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={field}
        >
          <option value="">Choose…</option>
          {group("in", "Money in")}
          {group("out", "Money out")}
        </select>
      </label>
      <Button type="submit" variant="secondary" className="h-8" disabled={pending}>
        {pending ? "Labelling…" : "Label"}
      </Button>
    </form>
  );
}

/** Bills: remind about each, or cancel those nothing was paid towards (with a reason). */
export function BillsBar({
  ticked,
  clear,
  say,
}: {
  ticked: { id: string }[];
  clear: () => void;
  say: (words: string) => void;
}) {
  const { pending, run } = useBulk(clear, say);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const ids = ticked.map((t) => t.id);

  if (cancelling)
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await bulkVoid(ids, reason);
            if (!r.error) setCancelling(false);
            return r;
          });
        }}
      >
        <label className="flex items-center gap-2">
          Why cancel them?
          <input
            required
            autoFocus
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={field}
          />
        </label>
        <Button type="submit" variant="danger" className="h-8" disabled={pending}>
          {pending
            ? "Cancelling…"
            : `Cancel ${ids.length === 1 ? "this bill" : `${ids.length} bills`}`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-8"
          onClick={() => setCancelling(false)}
        >
          Keep them
        </Button>
      </form>
    );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-8"
        disabled={pending}
        onClick={() => run(() => bulkRemind(ids))}
      >
        {pending ? "Adding…" : "Send a reminder"}
      </Button>
      <Button type="button" variant="secondary" className="h-8" onClick={() => setCancelling(true)}>
        Cancel bills…
      </Button>
    </>
  );
}

/** Customers: a reminder for every bill they still owe. */
export function CustomersBar({
  ticked,
  clear,
  say,
}: {
  ticked: { id: string }[];
  clear: () => void;
  say: (words: string) => void;
}) {
  const { pending, run } = useBulk(clear, say);
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-8"
      disabled={pending}
      onClick={() => run(() => bulkRemindCustomers(ticked.map((t) => t.id)))}
    >
      {pending ? "Adding…" : "Remind about what they owe"}
    </Button>
  );
}
