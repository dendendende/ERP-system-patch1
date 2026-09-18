"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";

/** 6-digit authenticator code for a TOTP factor. On success the session becomes aal2. */
export function CodeForm({ factorId, submitLabel }: { factorId: string; submitLabel: string }) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(form: FormData) {
    setPending(true);
    setError(undefined);
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setError("That code didn't work. Check the app and try the newest code.");
      setPending(false);
      return;
    }
    router.replace("/");
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <Input
        label="6-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
        className="tabular-nums tracking-widest"
        error={error}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}
