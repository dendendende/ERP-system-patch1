"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.error}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
