"use client";

import { Button, Input } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { addCustomer, type AddCustomerState } from "./actions";

export function AddCustomerForm() {
  const [state, action, pending] = useFormAction<AddCustomerState>(addCustomer, {});
  return (
    <details className="group rounded-xl border border-line bg-surface p-5">
      <summary className="cursor-pointer font-medium">Add a customer</summary>
      <form onSubmit={action} className="mt-4 flex flex-col gap-3">
        <Input label="Name" name="name" id="customer-name" placeholder="PT Maju Jaya" required />
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="WhatsApp number"
            name="whatsapp"
            id="customer-whatsapp"
            inputMode="tel"
            placeholder="0812 3456 7890"
          />
          <Input
            label="Billing email"
            name="email"
            id="customer-email"
            type="email"
            placeholder="finance@majujaya.co.id"
          />
        </div>
        <label htmlFor="customer-language" className="flex flex-col gap-1.5 text-sm font-medium">
          Messages in
          <select
            id="customer-language"
            name="language"
            defaultValue="id"
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal"
          >
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
        </label>
        {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Adding…" : "Add and set up what they pay"}
        </Button>
      </form>
    </details>
  );
}
