import { companyAccount } from "@/lib/company";
import { invoicePdf } from "@/lib/reminders/email";
import { createClient } from "@/lib/supabase/server";

// The bill as a PDF, for attaching to an email sent by hand. Read with the signed-in person's own
// permissions (row-level security), like every page.
export async function GET(_request: Request, ctx: RouteContext<"/customers/[id]/bills/[invoiceId]/pdf">) {
  const { invoiceId } = await ctx.params;
  const supabase = await createClient();
  const { data: bill } = await supabase
    .from("invoices")
    .select(
      "number, issued_on, due_on, amount_due::text, transfer_amount::text, payments (amount_applied::text), customers (name, billing_email, language)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!bill?.customers) return new Response("Not found", { status: 404 });

  const amountDue = BigInt(bill.amount_due);
  const paid = bill.payments.reduce((total, p) => total + BigInt(p.amount_applied), 0n);
  const pdf = invoicePdf(
    {
      customerName: bill.customers.name,
      billingEmail: bill.customers.billing_email,
      language: bill.customers.language === "en" ? "en" : "id",
      invoiceNumber: bill.number,
      issuedOn: bill.issued_on,
      dueOn: bill.due_on,
      amountDue,
    },
    {
      amountToTransfer: bill.transfer_amount ? BigInt(bill.transfer_amount) : null,
      stillOwed: amountDue > paid ? amountDue - paid : 0n,
    },
    companyAccount(),
  );
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${bill.number}.pdf"`,
    },
  });
}
