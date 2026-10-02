"use client";


import { Button, Card, Input, StatusPill } from "@/components/ui";
import { addBankAccount, type BankFormState } from "./actions";
import { useFormAction } from "@/components/use-form-action";

export function AddAccountForm() {
  const [state, action, pending] = useFormAction<BankFormState>(addBankAccount, {});
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-xl">Add an account</h2>
      <form onSubmit={action} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Bank" name="bank_name" placeholder="BCA" required />
          <Input
            label="Account name"
            name="account_name"
            placeholder="PT Contoh Operasional"
            required
          />
          <Input
            label="Last 4 digits"
            name="account_last4"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="1234"
            required
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Where the data comes from
            <select
              name="source"
              defaultValue="csv"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal"
            >
              <option value="csv">Statements I upload</option>
              <option value="aggregator">Bank connection (automatic)</option>
            </select>
          </label>
        </div>
        {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
        {state.added ? <StatusPill tone="in">Added {state.added}</StatusPill> : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Adding…" : "Add account"}
        </Button>
      </form>
    </Card>
  );
}
