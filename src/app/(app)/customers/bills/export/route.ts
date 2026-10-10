import { BILL_SORT_COLUMN, billListArgs, readBillFilters } from "@/lib/bill-filters";
import { toCsv } from "@/lib/csv";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { createClient } from "@/lib/supabase/server";

// Every bill the list shows for these filters, as a spreadsheet. Same filters, same function
// (bill_list), so the file always matches the screen. Read with the person's own rights.
const BATCH = 1000; // the API's page size
const MAX_ROWS = 50_000;

export async function GET(request: Request) {
  const f = readBillFilters(Object.fromEntries(new URL(request.url).searchParams));
  const [column, ascending] = BILL_SORT_COLUMN[f.sort];
  const supabase = await createClient();
  const rows: (string | number | bigint)[][] = [];
  for (let start = 0; start < MAX_ROWS; start += BATCH) {
    const { data, error } = await supabase
      .rpc("bill_list", billListArgs(f))
      .select(
        "number, customer, status, issued_on, due_on, billed::text, paid::text, owed::text, days_late",
      )
      .order(column, { ascending })
      .order("number", { ascending })
      .range(start, start + BATCH - 1);
    if (error) return new Response("Couldn't make the file. Try again.", { status: 500 });
    for (const b of data) {
      rows.push([
        b.number,
        b.customer,
        (INVOICE_STATUS[b.status] ?? INVOICE_STATUS.open).label,
        b.issued_on,
        b.due_on,
        // whole rupiah, so a spreadsheet can add the columns up
        BigInt(b.billed),
        BigInt(b.paid),
        BigInt(b.owed),
        b.days_late,
      ]);
    }
    if (data.length < BATCH) break;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const csv = toCsv(
    [
      "Bill",
      "Customer",
      "Status",
      "Sent",
      "Due",
      "Bill (Rp)",
      "Paid (Rp)",
      "Still owed (Rp)",
      "Days late",
    ],
    rows,
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bills-${today}.csv"`,
    },
  });
}
