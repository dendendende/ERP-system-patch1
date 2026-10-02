import { Card, TableRow } from "@/components/ui";
import { ASSUMPTIONS, type Forecast, type Move, forecastHeadline } from "@/lib/forecast";
import { loadForecast } from "@/lib/forecast-data";
import { formatRupiah, formatRupiahShort } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Cash forecast · Cashflow" };

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const label = (d: string) => dayMonth.format(new Date(`${d}T00:00:00Z`));

/** 90 days as one line; below zero is shaded, the lowest point is marked. */
function ForecastChart({ f, today }: { f: Forecast; today: string }) {
  const W = 900;
  const H = 260;
  const pad = 24; // room for the labels
  const points = [{ date: today, balance: f.start }, ...f.days];
  const values = points.map((p) => Number(p.balance));
  // zoom to the actual range; bring zero in only when the balance gets near or below it
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const pad5 = (hi - lo || Math.abs(hi) || 1) * 0.1;
  const nearZero = lo - pad5 <= 0;
  const max = hi + pad5;
  const min = nearZero ? Math.min(lo - pad5, 0) : lo - pad5;
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v: number) => pad + ((max - v) * (H - 2 * pad)) / span;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(p.balance)).toFixed(1)}`).join(" ");
  // no marker when the lowest point is simply today
  const low = f.lowest.date === today ? -1 : points.findIndex((p) => p.date === f.lowest.date);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-60 w-full" role="img" aria-label="Expected bank balance, day by day, for the next 90 days">
      {nearZero ? (
        <>
          <rect x={0} y={y(0)} width={W} height={H - y(0)} className="fill-problem/10" />
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-problem/40" strokeDasharray="4 4" />
        </>
      ) : null}
      {/* the scale: top and bottom amounts, and dates along the bottom */}
      <text x={pad} y={14} className="fill-muted text-[12px]">{formatRupiahShort(BigInt(Math.round(max)))}</text>
      <text x={pad} y={H - 4} className="fill-muted text-[12px]">{formatRupiahShort(BigInt(Math.round(min)))}</text>
      {[0, 30, 60, 90].filter((i) => i < points.length).map((i) => (
        <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === 90 ? "end" : "middle"} className="fill-muted text-[12px]">
          {i === 0 ? "" : label(points[i].date)}
        </text>
      ))}
      <path d={line} className="fill-none stroke-ink" strokeWidth={2} strokeLinejoin="round" />
      {low >= 0 ? (
        <g>
          <circle cx={x(low)} cy={y(Number(f.lowest.balance))} r={5} className="fill-problem" />
          <text
            x={Math.min(x(low), W - 120)}
            y={Math.max(y(Number(f.lowest.balance)) - 10, 14)}
            className="fill-ink text-[13px]"
          >
            Lowest: {label(f.lowest.date)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function Biggest({ title, moves }: { title: string; moves: Move[] }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="font-display text-xl">{title}</h2>
      {moves.length ? (
        <Card className="p-0">
          {moves.map((m) => (
            <TableRow
              key={`${m.date}-${m.label}`}
              primary={m.label}
              secondary={label(m.date)}
              amount={
                <span className={m.direction === "in" ? "text-in" : undefined}>
                  {m.direction === "in" ? "+" : "−"}
                  {formatRupiah(m.amount)}
                </span>
              }
            />
          ))}
        </Card>
      ) : (
        <p className="text-sm text-muted">Nothing expected.</p>
      )}
    </section>
  );
}

const biggest = (moves: Move[], direction: Move["direction"]) =>
  moves
    .filter((m) => m.direction === direction)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
    .slice(0, 5);

export default async function ForecastPage() {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const f = await loadForecast(supabase, today);
  const { headline, warning } = forecastHeadline(f, today, formatRupiahShort);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl md:text-4xl">Cash forecast</h1>
        <p className="text-lg">{headline}</p>
        {warning ? (
          <p className="rounded-lg bg-problem/10 px-3 py-2 text-sm text-problem">{warning}</p>
        ) : null}
      </div>

      <Card className="flex flex-col gap-3">
        <ForecastChart f={f} today={today} />
        <p className="text-sm text-muted">Forecast assumes customers pay like they usually do.</p>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Biggest title="Biggest money coming in" moves={biggest(f.moves, "in")} />
        <Biggest title="Biggest money going out" moves={biggest(f.moves, "out")} />
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted underline underline-offset-4">What this forecast assumes</summary>
        <ul className="mt-2 list-disc pl-5 text-muted">
          {ASSUMPTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
