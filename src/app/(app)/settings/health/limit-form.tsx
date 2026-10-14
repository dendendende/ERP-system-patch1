"use client";

import { Button, StatusPill } from "@/components/ui";
import { type LimitState, updateLimit } from "./actions";
import { useFormAction } from "@/components/use-form-action";

const field =
  "h-10 w-28 rounded-lg border border-line bg-surface px-3 text-sm font-normal tabular-nums";

export function LimitForm({
  signal,
  healthy,
  warning,
  unit,
  safeWord,
  warnWord,
}: {
  signal: string;
  healthy: number;
  warning: number | null;
  unit: string;
  safeWord: string;
  warnWord: string;
}) {
  const [state, action, pending] = useFormAction<LimitState>(updateLimit, {});
  return (
    <form onSubmit={action} className="flex flex-col gap-2">
      <input type="hidden" name="signal" value={signal} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Safe when {safeWord} ({unit})
          <input
            type="number"
            step={unit.startsWith("Rp") ? 1 : "any"}
            name="healthy"
            defaultValue={healthy}
            className={field}
          />
        </label>
        {warning === null ? null : (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Danger when {warnWord} ({unit})
            <input
              type="number"
              step={unit.startsWith("Rp") ? 1 : "any"}
              name="warning"
              defaultValue={warning}
              className={field}
            />
          </label>
        )}
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
      {state.ok ? <StatusPill tone="in">{state.ok}</StatusPill> : null}
    </form>
  );
}
