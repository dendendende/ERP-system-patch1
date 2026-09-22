"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button, Card, Input, StatusPill } from "@/components/ui";
import { createSubscription, type FormState, updateSubscription } from "./actions";

const field = "h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal";
const labelled = "flex flex-col gap-1.5 text-sm font-medium";

export type Subscription = {
  id: string;
  plan_name: string;
  price: string;
  cycle: string;
  status: string;
  start_date: string;
  next_invoice_date: string;
  end_date: string | null;
};

function Result({ state }: { state: FormState }) {
  const router = useRouter();
  useEffect(() => {
    if (state.at) router.refresh();
  }, [state.at, router]);

  if (state.error) return <p className="text-sm text-problem">{state.error}</p>;
  if (state.ok) return <StatusPill tone="in">{state.ok}</StatusPill>;
  return null;
}

/** The fields of a subscription. `id` keeps labels pointing at the right box when a page shows several. */
function Fields({
  id,
  subscription,
  today,
}: {
  id: string;
  subscription?: Subscription;
  today: string;
}) {
  return (
    <>
      <Input
        label="Plan"
        name="plan"
        id={`plan-${id}`}
        defaultValue={subscription?.plan_name ?? ""}
        placeholder="Starter"
        className="w-44"
      />
      <Input
        label="Price (Rp)"
        name="price"
        id={`price-${id}`}
        inputMode="numeric"
        defaultValue={subscription ? subscription.price : ""}
        placeholder="1.500.000"
        className="w-40 tabular-nums"
      />
      <label className={labelled}>
        Renews
        <select name="cycle" defaultValue={subscription?.cycle ?? "monthly"} className={field}>
          <option value="monthly">every month</option>
          <option value="quarterly">every 3 months</option>
          <option value="yearly">every year</option>
        </select>
      </label>
      <label className={labelled}>
        Started
        <input
          type="date"
          name="startDate"
          defaultValue={subscription?.start_date ?? today}
          className={`${field} tabular-nums`}
        />
      </label>
      <label className={labelled}>
        Next bill
        <input
          type="date"
          name="nextInvoiceDate"
          defaultValue={subscription?.next_invoice_date ?? today}
          className={`${field} tabular-nums`}
        />
      </label>
      <label className={labelled}>
        Runs until (optional)
        <input
          type="date"
          name="endDate"
          defaultValue={subscription?.end_date ?? ""}
          className={`${field} tabular-nums`}
        />
      </label>
      <label className={labelled}>
        State
        <select name="status" defaultValue={subscription?.status ?? "active"} className={field}>
          <option value="active">Running</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
        </select>
      </label>
    </>
  );
}

export function NewSubscriptionForm({
  customerId,
  today,
}: {
  customerId: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createSubscription, {});
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-display text-lg">Set up a subscription</h3>
      <form action={action} className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="customerId" value={customerId} />
        <Fields id="new" today={today} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      <Result state={state} />
      <p className="text-sm text-muted">
        Bills for it are written by themselves, two weeks before each renewal.
      </p>
    </Card>
  );
}

export function EditSubscription({
  customerId,
  subscription,
  today,
}: {
  customerId: string;
  subscription: Subscription;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(updateSubscription, {});
  // A save folds the panel away; the page below then shows what was saved. Nothing rewrites
  // the boxes while someone is still typing in them.
  const [saved, setSaved] = useState(state.at);
  if (state.at !== saved) {
    setSaved(state.at);
    setOpen(false);
  }

  return (
    <div className="w-full">
      <details className="text-sm" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-muted underline underline-offset-4">Change</summary>
        <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="subscriptionId" value={subscription.id} />
          <Fields id={subscription.id} subscription={subscription} today={today} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </details>
      <div className="mt-2">
        <Result state={state} />
      </div>
    </div>
  );
}
