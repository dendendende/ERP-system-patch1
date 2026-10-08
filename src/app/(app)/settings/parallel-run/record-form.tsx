"use client";

import { Button, Input, StatusPill } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { recordWeek, type RecordState } from "./actions";

export function RecordWeekForm({ lastMonday }: { lastMonday: string }) {
  const [state, action, pending] = useFormAction<RecordState>(recordWeek, {});
  return (
    <form onSubmit={action} className="flex flex-col gap-3">
      <Input
        label="Week starting (Monday)"
        name="week"
        id="pr-week"
        type="date"
        defaultValue={lastMonday}
        className="w-48 tabular-nums"
        required
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="Came in that week (Rp)"
          name="came_in"
          id="pr-in"
          inputMode="numeric"
          placeholder="12.500.000"
          required
        />
        <Input
          label="Went out that week (Rp)"
          name="went_out"
          id="pr-out"
          inputMode="numeric"
          placeholder="4.000.000"
          required
        />
        <Input
          label="Cash in the bank right now (Rp)"
          name="cash"
          id="pr-cash"
          inputMode="numeric"
          hint="From your internet banking, all accounts together."
          required
        />
        <Input
          label="Still owed by customers right now (Rp)"
          name="still_owed"
          id="pr-owed"
          inputMode="numeric"
          required
        />
      </div>
      <Input
        label="Note (optional)"
        name="notes"
        id="pr-notes"
        placeholder="Where the numbers came from"
      />
      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
      {state.saved ? <StatusPill tone="in">Saved the week from {state.saved}</StatusPill> : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Comparing…" : "Save and compare"}
      </Button>
    </form>
  );
}
