"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Input, StatusPill } from "@/components/ui";
import { type CostState, dismissSuggestion, saveCost } from "./actions";
import { useFormAction } from "@/components/use-form-action";

const field = "h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal";
const labelled = "flex flex-col gap-1.5 text-sm font-medium";

function useAction(fn: typeof saveCost) {
  const [state, action, pending] = useFormAction<CostState>(fn, {});
  const router = useRouter();
  useEffect(() => {
    if (state.at) router.refresh();
  }, [state.at, router]);
  return { state, action, pending };
}

function Result({ state }: { state: CostState }) {
  if (state.error) return <p className="text-sm text-problem">{state.error}</p>;
  if (state.ok) return <StatusPill tone="in">{state.ok}</StatusPill>;
  return null;
}

export type Cost = {
  id?: string;
  name: string;
  expected_amount: string;
  frequency: string;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};

/** Add or change a regular cost. `key` keeps labels unique when several are on the page. */
export function CostForm({ cost, today, idKey }: { cost?: Cost; today: string; idKey: string }) {
  const { state, action, pending } = useAction(saveCost);
  return (
    <form onSubmit={action} className="flex flex-col gap-3">
      {cost?.id ? <input type="hidden" name="id" value={cost.id} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Name"
          name="name"
          id={`name-${idKey}`}
          defaultValue={cost?.name}
          placeholder="Office rent"
          className="w-56"
        />
        <Input
          label="Amount (Rp)"
          name="amount"
          id={`amount-${idKey}`}
          inputMode="numeric"
          defaultValue={cost?.expected_amount}
          placeholder="12.000.000"
          className="w-40 tabular-nums"
        />
        <label className={labelled}>
          How often
          <select name="frequency" defaultValue={cost?.frequency ?? "monthly"} className={field}>
            <option value="monthly">every month</option>
            <option value="quarterly">every 3 months</option>
            <option value="yearly">every year</option>
          </select>
        </label>
        <label className={labelled}>
          On day
          <input
            type="number"
            name="day"
            min={1}
            max={31}
            defaultValue={cost?.day_of_month ?? 1}
            className={`${field} w-20 tabular-nums`}
          />
        </label>
        <label className={labelled}>
          Since
          <input
            type="date"
            name="startDate"
            defaultValue={cost?.start_date ?? today}
            className={`${field} tabular-nums`}
          />
        </label>
        <label className={labelled}>
          Until (optional)
          <input
            type="date"
            name="endDate"
            defaultValue={cost?.end_date ?? ""}
            className={`${field} tabular-nums`}
          />
        </label>
        {cost?.id ? (
          <label className={labelled}>
            State
            <select name="isActive" defaultValue={cost.is_active ? "on" : "off"} className={field}>
              <option value="on">Still paying</option>
              <option value="off">Stopped</option>
            </select>
          </label>
        ) : null}
        <Button type="submit" variant={cost?.id ? "secondary" : "primary"} disabled={pending}>
          {pending ? "Saving…" : cost?.id ? "Save" : "Add"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** A pattern from the bank: the owner adds it as a regular cost, or says it isn't one. */
export function Suggestion({
  pattern,
  name,
  amount,
  day,
  categoryId,
  since,
}: {
  pattern: string;
  name: string;
  amount: string;
  day: number;
  categoryId: string | null;
  since: string;
}) {
  const add = useAction(saveCost);
  const dismiss = useAction(dismissSuggestion);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form onSubmit={add.action}>
          <input type="hidden" name="pattern" value={pattern} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="frequency" value="monthly" />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="startDate" value={since} />
          <input type="hidden" name="categoryId" value={categoryId ?? ""} />
          <Button type="submit" disabled={add.pending}>
            Add as a regular cost
          </Button>
        </form>
        <form onSubmit={dismiss.action}>
          <input type="hidden" name="pattern" value={pattern} />
          <Button type="submit" variant="ghost" disabled={dismiss.pending}>
            Not a regular cost
          </Button>
        </form>
      </div>
      <Result state={add.state} />
      <Result state={dismiss.state} />
    </div>
  );
}
