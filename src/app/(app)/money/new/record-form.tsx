"use client";

import { type FormEvent, startTransition, useActionState, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { recordByHand, type RecordState } from "./actions";

type Account = { id: string; label: string };
type Category = { id: string; name: string; type: string };

const field =
  "h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal transition-colors hover:border-muted/50";

export function RecordForm({
  formKey,
  direction: start,
  today,
  accounts,
  categories,
}: {
  formKey: string;
  direction: "in" | "out";
  today: string;
  accounts: Account[];
  categories: Category[];
}) {
  const [state, action, pending] = useActionState<RecordState, FormData>(recordByHand, {});
  const [direction, setDirection] = useState(start);
  const isIn = direction === "in";

  // Not <form action>: React empties a form after an action, which would lose what was typed
  // when the server says something needs fixing. Success moves to a fresh page anyway.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <input type="hidden" name="key" value={formKey} />
      <Card className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Did money come in or go out?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["in", "Money in", "+", "has-[:checked]:border-in has-[:checked]:bg-in/10"],
                [
                  "out",
                  "Money out",
                  "−",
                  "has-[:checked]:border-problem has-[:checked]:bg-problem/10",
                ],
              ] as const
            ).map(([value, text, sign, checked]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-line px-4 py-3 font-medium transition-colors hover:border-muted/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${checked}`}
              >
                <input
                  type="radio"
                  name="direction"
                  value={value}
                  checked={direction === value}
                  onChange={() => setDirection(value)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`grid size-7 place-items-center rounded-full text-lg ${value === "in" ? "bg-in/15 text-in" : "bg-problem/15 text-problem"}`}
                >
                  {sign}
                </span>
                {text}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Amount (Rp)"
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            required
            placeholder="1.500.000"
            className="tabular-nums text-base"
          />
          <Input label="Date" name="day" type="date" required defaultValue={today} max={today} />
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {isIn ? "Which account did it go into?" : "Which account did it come out of?"}
          <select name="account" required className={field}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl">Details</h2>
          <p className="text-sm text-muted">
            Optional, and can be changed later. They show in the list and can be searched.
          </p>
        </div>
        <Input
          label={isIn ? "Who paid you?" : "Who did you pay?"}
          name="counterparty"
          maxLength={200}
          placeholder={isIn ? "e.g. PT Maju Jaya" : "e.g. Toko Sinar, or the landlord"}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          What was it for?
          {/* the list depends on the direction: remount so a stale choice never sticks */}
          <select key={direction} name="category" defaultValue="" className={field}>
            <option value="">Decide later</option>
            {categories
              .filter((c) => c.type === direction)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Note
          <textarea
            name="note"
            maxLength={500}
            rows={3}
            placeholder={
              isIn ? "e.g. Cash for the March invoice" : "e.g. Printer ink and paper for the office"
            }
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal transition-colors placeholder:text-muted hover:border-muted/50"
          />
        </label>
      </Card>

      {state.error ? (
        <p role="alert" className="text-sm text-problem">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-11 self-start px-6">
        {pending ? "Saving…" : isIn ? "Save money in" : "Save money out"}
      </Button>
    </form>
  );
}
