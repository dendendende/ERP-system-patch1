"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Input, StatusPill } from "@/components/ui";
import { type FormState, sendReminderNow, setRemindersPaused } from "./actions";
import { useFormAction } from "@/components/use-form-action";

function useRefreshOnSuccess(state: FormState) {
  const router = useRouter();
  useEffect(() => {
    if (state.at) router.refresh();
  }, [state.at, router]);
}

function Result({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-problem">{state.error}</p>;
  if (state.ok) return <StatusPill tone="in">{state.ok}</StatusPill>;
  return null;
}

/** On a bill waiting for money: send the next reminder now instead of waiting for its day. */
export function SendReminderNow({ invoiceId, customerId }: { invoiceId: string; customerId: string }) {
  const [state, action, pending] = useFormAction<FormState>(sendReminderNow, {});
  useRefreshOnSuccess(state);
  return (
    <form onSubmit={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="customerId" value={customerId} />
      <Button type="submit" variant="secondary" disabled={pending || Boolean(state.ok)}>
        {pending ? "Adding…" : "Add a reminder to send today"}
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Pause every reminder for this customer (with a reason), or turn them back on. */
export function PauseReminders({ customerId, paused }: { customerId: string; paused: boolean }) {
  const [state, action, pending] = useFormAction<FormState>(setRemindersPaused, {});
  useRefreshOnSuccess(state);
  return (
    <form onSubmit={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="paused" value={String(!paused)} />
      {paused ? null : (
        <Input
          label="Pause reminders — why?"
          name="reason"
          id={`pause-reason-${customerId}`}
          placeholder="Agreed to pay next month"
          className="w-64"
        />
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : paused ? "Turn reminders back on" : "Pause reminders"}
      </Button>
      <Result state={state} />
    </form>
  );
}
