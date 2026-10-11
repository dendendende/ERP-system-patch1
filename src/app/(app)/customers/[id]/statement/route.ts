import { companyAccount } from "@/lib/company";
import { day, accountWarning } from "@/lib/reminders/templates";
import { customerStatement, findReport } from "@/lib/report-library";
import { readParams, reportPdf } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

// The customer statement to send them (P9-T3): ?from=&to=, as a PDF in their language, with the
// company and the fixed account to pay into. Read with the signed-in person's own permissions.
export async function GET(request: Request, ctx: RouteContext<"/customers/[id]/statement">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, language")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return new Response("Not found", { status: 404 });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const { from, to } = readParams(
    findReport("customer_statement")!,
    { ...query, customer: id },
    today,
  );
  const lang = customer.language === "en" ? "en" : "id";
  let account, result;
  try {
    account = companyAccount();
    result = await customerStatement(supabase, id, from, to, lang);
  } catch {
    return new Response("Couldn't make the statement. Try again.", { status: 500 });
  }

  const [first, last] = from <= to ? [from, to] : [to, from];
  const pdf = reportPdf(
    { title: lang === "id" ? "Laporan tagihan" : "Statement" },
    { ...result, notes: [...(result.notes ?? []), accountWarning(account, lang)] },
    {
      params: `${lang === "id" ? "Untuk" : "For"}: ${customer.name} · ${day(first, lang)} – ${day(last, lang)}`,
      on: today,
      stamp: `${account.companyName} · ${lang === "id" ? "dibuat" : "made"} ${day(today, lang)}`,
    },
  );
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${first}-${last}.pdf"`,
    },
  });
}
