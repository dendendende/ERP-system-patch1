"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { CodeForm } from "../code-form";

type Pending = { factorId: string; qr: string; secret: string };

export function Enroll() {
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const auth = createClient().auth;
    (async () => {
      // Drop half-finished setups from earlier visits, then start a fresh one.
      const { data: factors } = await auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) return setError("Couldn't start setup. Reload the page to try again.");
      setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  if (error) return <p className="text-sm text-problem">{error}</p>;
  if (!pending) return <p className="text-sm text-muted">Preparing…</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL SVG from Supabase */}
      <img
        src={pending.qr}
        alt="QR code for your authenticator app"
        className="mx-auto size-44 rounded-lg border border-line bg-surface p-2"
      />
      <details className="text-sm text-muted">
        <summary className="cursor-pointer">Can&apos;t scan? Type this key instead</summary>
        <code className="mt-2 block rounded bg-ground p-2 break-all tabular-nums">
          {pending.secret}
        </code>
      </details>
      <CodeForm factorId={pending.factorId} submitLabel="Turn on and continue" />
    </div>
  );
}
