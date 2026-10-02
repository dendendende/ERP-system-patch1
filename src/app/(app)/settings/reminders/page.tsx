import Link from "next/link";
import { Card, StatusPill } from "@/components/ui";
import { type CompanyAccount, companyAccount } from "@/lib/company";
import { type MessageFacts, renderMessage } from "@/lib/reminders/templates";
import { createClient } from "@/lib/supabase/server";
import { StepForm } from "./step-form";

export const metadata = { title: "Reminders · Settings · Cashflow" };

const NAMES: Record<string, string> = {
  invoice: "The bill",
  reminder: "Reminder",
  due_tomorrow: "Due tomorrow",
  overdue: "Late notice",
  escalate_team: "Hand over to the team",
};

function whenLabel(offset: number) {
  if (offset === 0) return "On the due date";
  const days = `${Math.abs(offset)} ${Math.abs(offset) === 1 ? "day" : "days"}`;
  return offset < 0 ? `${days} before it's due` : `${days} late`;
}

/** Sample bill for previews: a partly paid one, so every line of the template shows. */
const SAMPLE: MessageFacts = {
  customerName: "PT Contoh Pelanggan",
  invoiceNumber: "INV-0123",
  amountToTransfer: 2_900_017n,
  stillOwed: 2_900_000n,
  paidSoFar: 2_000_000n,
  dueOn: "2026-10-20",
};

function Preview({ template, account }: { template: string; account: CompanyAccount }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline underline-offset-4">
        Preview the message
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {(["id", "en"] as const).map((lang) => {
          const { subject, body } = renderMessage(template, lang, SAMPLE, account);
          return (
            <div key={lang} className="rounded-lg bg-ground p-3">
              <p className="text-xs text-muted">{lang === "id" ? "Bahasa Indonesia" : "English"}</p>
              <p className="mt-1 font-medium">{subject}</p>
              <p className="mt-2 whitespace-pre-line">{body}</p>
            </div>
          );
        })}
      </div>
    </details>
  );
}

export default async function ReminderSettingsPage() {
  const supabase = await createClient();
  const { data: steps, error } = await supabase
    .from("reminder_schedule")
    .select("id, offset_days, kind, channels, template_key, is_active")
    .order("offset_days");

  let account: CompanyAccount | null = null;
  let accountProblem = "";
  try {
    account = companyAccount();
  } catch (e) {
    accountProblem = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="text-sm text-muted underline underline-offset-4">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Reminders</h1>
        <p className="text-muted">
          When customers hear from us about a bill. A change applies to every reminder not sent yet;
          what was already sent stays as it was.
        </p>
      </div>

      {account ? (
        <p className="text-sm text-muted">
          Every message ends with your one account:{" "}
          <span className="text-ink">
            {account.bankName} {account.accountNumber} a.n. {account.accountHolder}
          </span>
          . It is set by whoever runs the app, never from a message.
        </p>
      ) : (
        <p className="rounded-lg bg-attention-bg px-3 py-2 text-sm text-attention-ink">
          No reminders can go out: the company account isn&apos;t set up ({accountProblem}).
        </p>
      )}

      {error ? (
        <p className="text-sm text-problem">Couldn&apos;t load the schedule. Try again.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {steps?.map((s) => (
            <Card key={s.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl">{whenLabel(s.offset_days)}</h2>
                  <p className="text-sm text-muted">
                    {NAMES[s.kind] ?? s.kind}
                    {s.kind === "escalate_team"
                      ? " — a task on Home to call them, instead of another message"
                      : ` — by ${s.channels.map((c) => (c === "email" ? "email" : "WhatsApp")).join(" and ")}`}
                  </p>
                </div>
                <StatusPill tone={s.is_active ? "in" : "neutral"}>{s.is_active ? "On" : "Off"}</StatusPill>
              </div>
              <StepForm step={s} />
              {account && s.kind !== "escalate_team" ? (
                <Preview template={s.template_key} account={account} />
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
