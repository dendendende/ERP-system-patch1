import Link from "next/link";
import { along, type Gauge } from "@/lib/health-gauge";
import type { HealthStatus } from "@/lib/health-status";
import { formatRupiah, formatRupiahShort } from "@/lib/money";

// Small charts (v2) drawn with plain HTML/CSS: no chart library, no gradients, direct labels.
// Every bar is a link that narrows the list to it ("every number is a door"), and every bar
// has a full sentence for screen readers.

const percent = (value: bigint, max: bigint) =>
  max > 0n ? Math.max(value > 0n ? 2 : 0, Number((value * 1000n) / max) / 10) : 0;

/** Money in vs out per period, side by side. */
export function InOutBars({
  periods,
  label,
}: {
  periods: { label: string; longLabel: string; cameIn: bigint; wentOut: bigint; href: string }[];
  label: string;
}) {
  const max = periods.reduce(
    (m, p) => [p.cameIn, p.wentOut, m].reduce((a, b) => (a > b ? a : b)),
    0n,
  );
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        <span className="flex gap-3">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-sm bg-in" /> Came in
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-sm bg-problem" /> Went out
          </span>
        </span>
      </figcaption>
      <ul className="flex h-32 items-end gap-2">
        {periods.map((p) => (
          <li key={p.label} className="flex h-full min-w-0 flex-1 flex-col">
            <Link
              href={p.href}
              aria-label={`${p.longLabel}: came in ${formatRupiah(p.cameIn)}, went out ${formatRupiah(p.wentOut)}. Show only ${p.longLabel}.`}
              className="group flex h-full flex-col justify-end rounded-md px-0.5 transition-colors hover:bg-ground"
            >
              <span className="flex h-full items-end justify-center gap-0.5">
                <span
                  className="w-1/3 max-w-4 rounded-t-sm bg-in transition-opacity group-hover:opacity-80"
                  style={{ height: `${percent(p.cameIn, max)}%` }}
                />
                <span
                  className="w-1/3 max-w-4 rounded-t-sm bg-problem transition-opacity group-hover:opacity-80"
                  style={{ height: `${percent(p.wentOut, max)}%` }}
                />
              </span>
              <span className="mt-1 truncate text-center text-[11px] text-muted">{p.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The biggest parts of a whole, as horizontal bars with the amount written next to each. */
export function ShareBars({
  items,
  label,
}: {
  items: { label: string; value: bigint; tone: "in" | "out"; href: string }[];
  label: string;
}) {
  const max = items.reduce((m, i) => (i.value > m ? i.value : m), 0n);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs text-muted">{label}</figcaption>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={`${item.tone}-${item.label}`}>
            <Link
              href={item.href}
              aria-label={`${item.label}: ${item.tone === "in" ? "came in" : "went out"} ${formatRupiah(item.value)}. Show only these.`}
              className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 rounded-md px-1 py-1 text-xs transition-colors hover:bg-ground"
            >
              <span className="truncate">{item.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-line/60">
                <span
                  className={`block h-full rounded-full ${item.tone === "in" ? "bg-in" : "bg-problem"}`}
                  style={{ width: `${percent(item.value, max)}%` }}
                />
              </span>
              <span
                className={`text-right whitespace-nowrap ${item.tone === "in" ? "text-in" : "text-problem"}`}
              >
                {item.tone === "in" ? "+" : "−"}
                {formatRupiahShort(item.value)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const STATUS_BG = { healthy: "bg-in", warning: "bg-attention", danger: "bg-problem" } as const;
const STATUS_STROKE = {
  healthy: "stroke-in",
  warning: "stroke-attention",
  danger: "stroke-problem",
} as const;

/** One segment per check, coloured by its status; the middle says how many are healthy. */
export function ScoreRing({
  statuses,
  className,
}: {
  statuses: (HealthStatus | null)[];
  className?: string;
}) {
  const r = 42;
  const round = 2 * Math.PI * r;
  const slice = round / Math.max(1, statuses.length);
  const healthy = statuses.filter((s) => s === "healthy").length;
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${healthy} of ${statuses.length} checks healthy`}
      className={className}
    >
      <g transform="rotate(-90 50 50)">
        {statuses.map((s, i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="9"
            strokeLinecap="butt"
            className={s ? STATUS_STROKE[s] : "stroke-line"}
            strokeDasharray={`${slice - 3} ${round - slice + 3}`}
            strokeDashoffset={-i * slice}
          />
        ))}
      </g>
      <text x="50" y="50" textAnchor="middle" className="fill-ink text-[22px] font-semibold">
        {healthy}/{statuses.length}
      </text>
      <text x="50" y="66" textAnchor="middle" className="fill-muted text-[10px]">
        healthy
      </text>
    </svg>
  );
}

/** A track coloured by the owner's limits, with a pin where the business is today. */
export function GaugeBar({
  gauge,
  format,
  label,
}: {
  gauge: Gauge;
  /** How a limit or the value reads, e.g. "25%", "6 mo". */
  format: (v: number) => string;
  /** The whole picture as one sentence, for screen readers. */
  label: string;
}) {
  const limits = [...new Set(gauge.zones.slice(1).map((z) => z.from))];
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-1 px-4 pt-6 pb-4">
      <div className="relative h-2.5 rounded-full bg-line">
        <span className="absolute inset-0 overflow-hidden rounded-full">
          {gauge.zones.map((z) => (
            <span
              key={z.from}
              className={`absolute inset-y-0 ${STATUS_BG[z.status]} opacity-35`}
              style={{
                left: `${along(gauge, z.from)}%`,
                width: `${along(gauge, z.to) - along(gauge, z.from)}%`,
              }}
            />
          ))}
        </span>
        {limits.map((v) => (
          <span
            key={v}
            className="absolute -bottom-4 -translate-x-1/2 text-[11px] text-muted tabular-nums"
            style={{ left: `${along(gauge, v)}%` }}
          >
            {format(v)}
          </span>
        ))}
        {gauge.marker !== null ? (
          <span
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-[left] duration-200"
            style={{ left: `${along(gauge, gauge.marker)}%` }}
          >
            <span className="absolute -top-6 rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-surface tabular-nums">
              {format(gauge.marker)}
            </span>
            <span className="size-4 rounded-full border-[3px] border-surface bg-ink shadow" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A small line of recent values; nothing until there are two to join. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = (v: number) => (hi === lo ? 14 : 26 - ((v - lo) / (hi - lo)) * 24);
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden className={className}>
      <polyline
        points={points}
        fill="none"
        className="stroke-brand"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
