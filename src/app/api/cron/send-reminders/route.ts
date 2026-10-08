import { companyAccount } from "@/lib/company";
import { authorized } from "@/lib/cron";
import { type BillFacts, emailChannel, mailpitTransport } from "@/lib/reminders/email";
import { type MessageChannel, runSender } from "@/lib/reminders/sender";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Db = ReturnType<typeof createAdminClient>;

/** Pretend WhatsApp for development: "sends" by writing to the server log. */
const loggingChannel: MessageChannel = {
  async send(reminder) {
    console.info(`[mock ${reminder.channel}] ${reminder.template_key} for invoice ${reminder.invoice_id}`);
    return { providerMessageId: `mock-${reminder.id}` };
  },
};

/** Who the message goes to and what bill it is about. */
function billLoader(db: Db) {
  return async (invoiceId: string): Promise<BillFacts> => {
    const { data, error } = await db
      .from("invoices")
      .select("number, issued_on, due_on, amount_due::text, customers (name, billing_email, language)")
      .eq("id", invoiceId)
      .single();
    if (error || !data?.customers) throw new Error(`Couldn't load the bill: ${error?.message ?? "no customer"}`);
    return {
      customerName: data.customers.name,
      billingEmail: data.customers.billing_email,
      language: data.customers.language === "en" ? "en" : "id",
      invoiceNumber: data.number,
      issuedOn: data.issued_on,
      dueOn: data.due_on,
      amountDue: BigInt(data.amount_due),
    };
  };
}

function channelsFromEnv(db: Db): Record<string, MessageChannel> | null {
  switch (process.env.REMINDER_CHANNELS) {
    case "mock":
      // Fake sends must never mark real customers' reminders as sent.
      if (process.env.VERCEL_ENV === "production")
        throw new Error("REMINDER_CHANNELS=mock in production");
      return {
        // email really goes out — into the local test inbox (Mailpit), never to a customer
        email: emailChannel({
          account: companyAccount(),
          loadBill: billLoader(db),
          transport: mailpitTransport(process.env.MAILPIT_URL ?? "http://127.0.0.1:44324", {
            email: process.env.EMAIL_FROM ?? "tagihan@example.test",
            name: process.env.COMPANY_NAME ?? "Cashflow",
          }),
        }),
        whatsapp: loggingChannel, // P3-T5
      };
    default:
      return null; // no provider configured yet: send nothing
  }
}

// Every 15 minutes (vercel.json). Outside sending hours it does nothing.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  // ON HOLD (owner's decision, 2026-09-27): nothing is sent to customers automatically. Due
  // reminders go on the team's list ("Reminders to send" on Home) and a person sends them. To turn
  // automatic sending back on: set REMINDER_AUTO_SEND=on and re-add this route to vercel.json.
  if (process.env.REMINDER_AUTO_SEND !== "on")
    return Response.json({ skipped: "automatic sending is on hold" });

  // No channel yet: claim nothing, so nothing is marked failed while we wait for providers.
  const db = createAdminClient();
  const channels = channelsFromEnv(db);
  if (!channels) return Response.json({ skipped: "REMINDER_CHANNELS not set" });
  const call = async <T>(fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc(fn as never, args as never);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };

  const result = await runSender({
    channels,
    hours: process.env.REMINDER_SEND_HOURS,
    store: {
      failStaleClaims: () => call<number>("fail_stale_reminder_claims"),
      claim: (limit) => call("claim_due_reminders", { p_limit: limit }),
      record: async (id, r) => {
        await call("record_reminder_result", {
          p_id: id,
          p_sent: r.sent,
          p_provider_message_id: r.sent ? r.providerMessageId : null,
          // rupiah as a string: JSON numbers lose precision above 2^53
          p_amount_shown: r.sent && r.amountShown ? r.amountShown.toString() : null,
          p_error: r.sent ? null : r.error,
        });
      },
    },
  });
  return Response.json(result);
}
