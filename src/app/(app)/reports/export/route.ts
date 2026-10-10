import { findReport } from "@/lib/report-library";
import {
  describeParams,
  mayRun,
  readParams,
  reportCsv,
  reportPdf,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

// A report run, downloaded: ?format=pdf (to print or send) or csv (opens in Excel / Google
// Sheets). Same report, same parameters, same result as on screen — read with the person's own
// rights (RLS), and only by the roles the report allows.
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const report = findReport(query.report ?? "");
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_app_role");
  if (!report || !mayRun(report, role)) return new Response("Not found", { status: 404 });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const params = readParams(report, query, today);
  let result;
  try {
    result = await report.run(supabase, params);
  } catch {
    return new Response("Couldn't run the report. Try again.", { status: 500 });
  }
  // the file is named after the report and what it was run for
  const name = [report.id, ...report.params.map((p) => params[p.key])].join("-");

  if (query.format === "pdf") {
    const customers = report.params.some((p) => p.kind === "customer")
      ? ((await supabase.from("customers").select("id, name")).data ?? [])
      : [];
    const pdf = reportPdf(report, result, {
      params: describeParams(report, params, new Map(customers.map((c) => [c.id, c.name]))),
      on: today,
    });
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
      },
    });
  }
  return new Response(reportCsv(result), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
