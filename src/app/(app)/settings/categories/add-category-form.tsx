"use client";


import { Button, Card, Input, StatusPill } from "@/components/ui";
import { addCategory, type CategoryState } from "./actions";
import { useFormAction } from "@/components/use-form-action";

export function AddCategoryForm() {
  const [state, action, pending] = useFormAction<CategoryState>(addCategory, {});
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-xl">Add a category</h2>
      <form onSubmit={action} className="flex flex-wrap items-end gap-4">
        <Input label="Name" name="name" placeholder="Training" required className="w-56" />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          For
          <select
            name="type"
            defaultValue="out"
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal"
          >
            <option value="out">Money going out</option>
            <option value="in">Money coming in</option>
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
      {state.added ? <StatusPill tone="in">Added {state.added}</StatusPill> : null}
    </Card>
  );
}
