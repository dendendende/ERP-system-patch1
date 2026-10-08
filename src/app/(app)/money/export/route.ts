import { toCsv } from "@/lib/csv";
import { CANCELLED_CATEGORY } from "@/lib/money";
import { SORT_COLUMN, moneyListArgs, readMoneyFilters } from "@/lib/money-filters";
import { createClient } from "@/lib/supabase/server";

// Everything the list shows for these filters, as a spreadsheet. Same filters, same function
// (money_list), so the file always matches the screen. Read with the person's own rights.
const BATCH = 1000; // the API's page size
const MAX_ROWS = 50_000;

export async function GET(request: Request) {
  const f = readMoneyFilters(Object.fromEntries(new URL(request.url).searchParams));
  const [column, ascending] = SORT_COLUMN[f.sort];
  const supabase = await createClient();
  const rows: string[][] = [];
  for (let start = 0; start < MAX_ROWS; start += BATCH) {
    const { data, error } = await supabase
      .rpc("money_list", moneyListArgs(f))
      // the sort columns must be selected too (rpc results can only be ordered by selected columns)
      .select(
        "id, occurred_at, day, description, account, direction, amount::text, category, status, invoice_number, is_own_transfer, counterparty, note, by_hand",
      )
      .order(column, { ascending })
      .order("id", { ascending })
      .range(start, start + BATCH - 1);
    if (error) return new Response("Couldn't make the file. Try again.", { status: 500 });
    for (const r of data) {
      rows.push([
        r.day,
        r.description,
        r.account,
        r.direction === "in" ? "In" : "Out",
        // whole rupiah, minus for money out, so a spreadsheet can add the column up
        r.direction === "in" ? r.amount : `-${r.amount}`,
        r.status === "needs_label" ? "" : (r.category ?? ""),
        r.status === "needs_label"
          ? "Needs a label"
          : r.category === CANCELLED_CATEGORY
            ? "Cancelled"
            : r.is_own_transfer
              ? "Own transfer"
              : "Labelled",
        r.invoice_number ?? "",
        r.counterparty,
        r.note,
        r.by_hand ? "By hand" : "Bank",
      ]);
    }
    if (data.length < BATCH) break;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const csv = toCsv(
    [
      "Date",
      "Description",
      "Account",
      "In/Out",
      "Amount (Rp)",
      "Category",
      "Status",
      "Bill",
      "Who",
      "Note",
      "Came from",
    ],
    rows.map((r) => [r[0], r[1], r[2], r[3], BigInt(r[4]), ...r.slice(5)]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="money-in-out-${today}.csv"`,
    },
  });
}
