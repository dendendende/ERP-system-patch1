"use client";

import { Button, Input } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { setPassword, type SetPasswordState } from "./actions";

export function SetPasswordForm() {
  const [state, action, pending] = useFormAction<SetPasswordState>(setPassword, {});
  return (
    <form onSubmit={action} className="flex flex-col gap-4">
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
      />
      <Input
        label="Type it again"
        name="again"
        type="password"
        autoComplete="new-password"
        required
        error={state.error}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}
