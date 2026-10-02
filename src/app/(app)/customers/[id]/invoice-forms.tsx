"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Input, StatusPill } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import {
  createInvoice,
  type FormState,
  markPaidWithoutTransfer,
  updateInvoice,
  voidInvoice,
} from "./actions";

const field = "h-10 rounded-lg border border-line bg-surface px-3 text-sm";

/** Shows how it went, and pulls the page fresh from the server after a change. */
function Result({ state }: { state: FormState }) {
  const router = useRouter();
  useEffect(() => {
    if (state.at) router.refresh();
  }, [state.at, router]);

  if (state.error) return <p className="text-sm text-problem">{state.error}</p>;
  if (state.ok) return <StatusPill tone="in">{state.ok}</StatusPill>;
  return null;
}

/** Write a new bill. Amounts are typed the way people write them: 1.500.000 */
export function NewInvoiceForm({
  customerId,
  today,
  subscriptions,
}: {
  customerId: string;
  today: string;
  subscriptions: { id: string; plan_name: string }[];
}) {
  const [state, action, pending] = useFormAction<FormState>(createInvoice, {});
  const inTwoWeeks = new Date(`${today}T12:00:00+07:00`);
  inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-xl">Write a bill</h2>
      <form onSubmit={action} className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="customerId" value={customerId} />
        <Input
          label="Amount (Rp)"
          name="amount"
          inputMode="numeric"
          placeholder="1.500.000"
          required
          className="w-44 tabular-nums"
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Sent on
          <input type="date" name="issuedOn" defaultValue={today} className={`${field} font-normal tabular-nums`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Due on
          <input
            type="date"
            name="dueOn"
            defaultValue={inTwoWeeks.toISOString().slice(0, 10)}
            className={`${field} font-normal tabular-nums`}
          />
        </label>
        {subscriptions.length ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            For
            <select name="subscriptionId" defaultValue="" className={`${field} font-normal`}>
              <option value="">A one-off</option>
              {subscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.plan_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Input label="Note (optional)" name="notes" className="w-56" />
        <Button type="submit" disabled={pending}>
          {pending ? "Writing…" : "Write bill"}
        </Button>
      </form>
      <Result state={state} />
      <p className="text-sm text-muted">
        The bill asks for a few rupiah more than the amount — those last digits are what tell us
        which bill a transfer is for.
      </p>
    </Card>
  );
}

/** Change what may be changed, or cancel the bill. A different amount = cancel and write a new one. */
export function EditInvoice({
  invoiceId,
  customerId,
  dueOn,
  notes,
  canVoid,
  canMarkPaid,
}: {
  invoiceId: string;
  customerId: string;
  dueOn: string;
  notes: string;
  canVoid: boolean;
  /** owner only: settle a bill no transfer will ever cover */
  canMarkPaid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saveState, save, saving] = useFormAction<FormState>(updateInvoice, {});
  const [voidState, cancel, cancelling] = useFormAction<FormState>(voidInvoice, {});
  const [paidState, markPaid, marking] = useFormAction<FormState>(
    markPaidWithoutTransfer,
    {},
  );
  // A save folds the panel away; the bill above then shows what was saved. Nothing rewrites
  // the boxes while someone is still typing in them.
  const done = saveState.at ?? voidState.at ?? paidState.at;
  const [saved, setSaved] = useState(done);
  if (done !== saved) {
    setSaved(done);
    setOpen(false);
  }

  return (
    <div>
    <details className="text-sm" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-muted underline underline-offset-4">Change</summary>
      <div className="mt-3 flex flex-col gap-3">
        <form onSubmit={save} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="customerId" value={customerId} />
          <label className="flex flex-col gap-1.5 font-medium">
            Due on
            <input
              type="date"
              name="dueOn"
              defaultValue={dueOn}
              className={`${field} font-normal tabular-nums`}
            />
          </label>
          <Input
            label="Note"
            name="notes"
            id={`notes-${invoiceId}`}
            defaultValue={notes}
            className="w-56"
          />
          <Button type="submit" variant="secondary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>

        {canVoid ? (
          <form onSubmit={cancel} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="customerId" value={customerId} />
            <Input
              label="Cancel this bill — why?"
              name="reason"
              id={`reason-${invoiceId}`}
              placeholder="Wrong amount"
              className="w-64"
            />
            <Button type="submit" variant="danger" disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel bill"}
            </Button>
          </form>
        ) : null}
        {canMarkPaid ? (
          <form onSubmit={markPaid} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="customerId" value={customerId} />
            <Input
              label="Paid, but not by transfer — how?"
              name="reason"
              id={`paid-reason-${invoiceId}`}
              placeholder="Paid cash at the office"
              className="w-64"
            />
            <Button type="submit" variant="secondary" disabled={marking}>
              {marking ? "Marking…" : "Mark paid"}
            </Button>
          </form>
        ) : null}
        <p className="text-muted">
          To change the amount, cancel this bill and write a new one — that keeps the history
          honest.
        </p>
      </div>
    </details>
      <div className="mt-2 text-sm">
        <Result state={saveState} />
        <Result state={voidState} />
        <Result state={paidState} />
      </div>
    </div>
  );
}
