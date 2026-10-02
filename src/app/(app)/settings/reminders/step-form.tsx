"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Checkbox, StatusPill } from "@/components/ui";
import { type StepState, updateStep } from "./actions";
import { useFormAction } from "@/components/use-form-action";

const field = "h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal";

export function StepForm({
  step,
}: {
  step: { id: string; kind: string; offset_days: number; channels: string[]; is_active: boolean };
}) {
  const [state, action, pending] = useFormAction<StepState>(updateStep, {});
  const router = useRouter();
  useEffect(() => {
    if (state.at) router.refresh(); // the step heading above shows the new days
  }, [state.at, router]);
  const toTeam = step.kind === "escalate_team";
  return (
    <form onSubmit={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={step.id} />
      <input type="hidden" name="kind" value={step.kind} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Days
          <input
            type="number"
            name="days"
            min={0}
            max={60}
            defaultValue={Math.abs(step.offset_days)}
            className={`${field} w-20 tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          When
          <select name="when" defaultValue={step.offset_days > 0 ? "after" : "before"} className={field}>
            <option value="before">before the due date</option>
            <option value="after">after the due date</option>
          </select>
        </label>
        {toTeam ? null : (
          <div className="flex flex-col gap-1.5 pb-2.5">
            <Checkbox name="email" label="Email" defaultChecked={step.channels.includes("email")} />
            <Checkbox
              name="whatsapp"
              label={<span className="text-muted">WhatsApp (on hold)</span>}
              disabled
            />
          </div>
        )}
        <div className="pb-2.5">
          <Checkbox name="is_active" label="On" defaultChecked={step.is_active} />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
      {state.ok ? <StatusPill tone="in">{state.ok}</StatusPill> : null}
    </form>
  );
}
