import Link from "next/link";
import { Card, EmptyState, StatusPill } from "@/components/ui";
import { formatRupiah } from "@/lib/money";
import { type ParallelWeek, compareWeek, readyForGoLive, weekMatches } from "@/lib/parallel-run";
import { createClient } from "@/lib/supabase/server";
import { lastWeek } from "@/lib/weekly-summary";
import { RecordWeekForm } from "./record-form";

export const metadata = { title: "Parallel run · Settings · Cashflow" };

const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC", // a plain date: don't let a time zone shift it
  day: "numeric",
  month: "short",
  year: "numeric",
});
const weekLabel = (monday: string) => {
  const sunday = new Date(`${monday}T00:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return `${day.format(new Date(`${monday}T00:00:00Z`))} – ${day.format(sunday)}`;
};

export default async function ParallelRunPage() {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  // bigint columns as text: JSON numbers lose precision above 2^53
  const { data, error } = await supabase
    .from("parallel_run_weeks")
    .select(
      "week_start, notes, their_came_in::text, their_went_out::text, their_cash::text, their_still_owed::text, app_came_in::text, app_went_out::text, app_cash::text, app_still_owed::text",
    )
    .order("week_start", { ascending: false });
  if (error) throw new Error(`Parallel run didn't load: ${error.message}`);

  const weeks = data.map((w) => ({
    notes: w.notes,
    week: {
      week_start: w.week_start,
      their_came_in: BigInt(w.their_came_in),
      their_went_out: BigInt(w.their_went_out),
      their_cash: BigInt(w.their_cash),
      their_still_owed: BigInt(w.their_still_owed),
      app_came_in: BigInt(w.app_came_in),
      app_went_out: BigInt(w.app_went_out),
      app_cash: BigInt(w.app_cash),
      app_still_owed: BigInt(w.app_still_owed),
    } satisfies ParallelWeek,
  }));
  const ready = readyForGoLive(weeks.map((w) => w.week));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="text-sm text-muted underline underline-offset-4">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Parallel run</h1>
        <p className="text-muted">
          For two weeks, keep tracking money the way you do today. Every Monday, write down your
          numbers here and the app puts its own next to them. When two weeks in a row match to the
          rupiah, the app is ready to rely on.
        </p>
      </div>

      {ready ? (
        <Card className="flex flex-col gap-1 border-in/40 bg-in/10">
          <p className="font-medium">Two weeks in a row match. The app is ready for go-live.</p>
          <p className="text-sm text-muted">
            The last step is yours: approve go-live (see the launch notes).
          </p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Write down a week</h2>
        <p className="text-sm text-muted">
          Leave out money moved between your own accounts: the app doesn&apos;t count it as coming
          in or going out. Writing the same week again replaces it.
        </p>
        <RecordWeekForm lastMonday={lastWeek(today).from} />
      </Card>

      {weeks.length ? (
        weeks.map(({ week, notes }) => {
          const matches = weekMatches(week);
          return (
            <Card key={week.week_start} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl">{weekLabel(week.week_start)}</h2>
                {matches ? (
                  <StatusPill tone="in">Matches</StatusPill>
                ) : (
                  <StatusPill tone="problem">Doesn&apos;t match</StatusPill>
                )}
              </div>
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 font-normal">
                      <span className="sr-only">Number</span>
                    </th>
                    <th className="py-1 text-right font-normal">Yours</th>
                    <th className="py-1 text-right font-normal">The app</th>
                    <th className="py-1 text-right font-normal">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {compareWeek(week).map((l) => (
                    <tr key={l.key} className="border-t border-line">
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {l.label}
                      </th>
                      <td className="py-1.5 text-right">{formatRupiah(l.theirs)}</td>
                      <td className="py-1.5 text-right">{formatRupiah(l.app)}</td>
                      <td
                        className={`py-1.5 text-right ${l.difference === 0n ? "text-muted" : "text-problem"}`}
                      >
                        {l.difference === 0n ? "—" : formatRupiah(l.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {notes ? <p className="text-sm text-muted">Note: {notes}</p> : null}
              {matches ? null : (
                <p className="text-sm text-muted">
                  Look for a transfer that one side has and the other doesn&apos;t.{" "}
                  <Link href="/money" className="underline underline-offset-4">
                    Money in &amp; out
                  </Link>{" "}
                  lists every one the app knows about.
                </p>
              )}
            </Card>
          );
        })
      ) : (
        <EmptyState title="No weeks written down yet">
          Start on the first Monday after the bank is connected.
        </EmptyState>
      )}
    </div>
  );
}
