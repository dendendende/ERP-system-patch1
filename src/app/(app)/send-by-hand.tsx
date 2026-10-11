"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, StatusPill } from "@/components/ui";
import { type CloseState, closeReminder } from "./reminder-actions";
import { useFormAction } from "@/components/use-form-action";

const link =
  "inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-ground";

/**
 * Everything a person needs to send one message themselves — or to hand it to Cowork. With a
 * reminder it can be marked as sent; a customer statement has none, so it only opens the message.
 */
export function SendByHand({
  reminderId,
  subject,
  body,
  email,
  phone,
  pdfUrl,
  pdfLabel = "Download the bill (PDF)",
  canAct,
}: {
  reminderId?: string;
  subject: string;
  body: string;
  email: string | null;
  phone: string | null;
  /** the PDF to attach by hand (the bill, or the statement) */
  pdfUrl?: string;
  pdfLabel?: string;
  canAct: boolean;
}) {
  const [state, action, pending] = useFormAction<CloseState>(closeReminder, {});
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (state.at) router.refresh();
  }, [state.at, router]);

  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;
  // wa.me wants the number without "+"; numbers are stored as E.164
  const whatsapp = phone ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(body)}` : null;

  return (
    <div className="flex flex-col gap-3">
      <details className="text-sm">
        <summary className="cursor-pointer text-muted underline underline-offset-4">Read the message</summary>
        <div className="mt-2 rounded-lg bg-ground p-3">
          <p className="font-medium">{subject}</p>
          <p className="mt-2 whitespace-pre-line">{body}</p>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(`${subject}\n\n${body}`);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy message"}
        </Button>
        {pdfUrl ? (
          <a href={pdfUrl} className={link}>
            {pdfLabel}
          </a>
        ) : null}
        {mailto ? (
          <a href={mailto} className={link}>
            Open in email
          </a>
        ) : null}
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={link}>
            Open in WhatsApp
          </a>
        ) : null}
        {canAct && reminderId ? (
          <form onSubmit={action} className="flex gap-2">
            <input type="hidden" name="reminderId" value={reminderId} />
            <Button type="submit" name="outcome" value="sent" disabled={pending || Boolean(state.done)}>
              Mark as sent
            </Button>
            <Button type="submit" name="outcome" value="skip" variant="ghost" disabled={pending || Boolean(state.done)}>
              Skip
            </Button>
          </form>
        ) : null}
      </div>
      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
      {state.done ? <StatusPill tone="in">{state.done === "sent" ? "Marked as sent" : "Skipped"}</StatusPill> : null}
    </div>
  );
}
