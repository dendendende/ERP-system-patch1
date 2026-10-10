import Link from "next/link";
import type { ReactNode } from "react";
import { arcs, biggest, foldIntoOther, linePoints, percent, sum } from "@/lib/chart-math";
import { along, type Gauge } from "@/lib/health-gauge";
import type { HealthStatus } from "@/lib/health-status";
import { formatRupiah, formatRupiahShort } from "@/lib/money";

// Small charts (v2) drawn with plain HTML/CSS/SVG: no chart library, no gradients, one axis.
// Every mark is a link that narrows the list to it ("every number is a door": the click is the
// filter, carried in the address), every mark has a full sentence for screen readers, and
// pointing at one shows its numbers. Text is always in ink; colour only says which series.

/** What a series is drawn in. "in"/"out" mean money in and out; 1–6 are categories, in order. */
export type Tone = "in" | "out" | 1 | 2 | 3 | 4 | 5 | 6 | "other";

const BG: Record<Tone, string> = {
  in: "bg-in",
  out: "bg-problem",
  1: "bg-series-1",
  2: "bg-series-2",
  3: "bg-series-3",
  4: "bg-series-4",
  5: "bg-series-5",
  6: "bg-series-6",
  other: "bg-series-other",
};
const STROKE: Record<Tone, string> = {
  in: "stroke-in",
  out: "stroke-problem",
  1: "stroke-series-1",
  2: "stroke-series-2",
  3: "stroke-series-3",
  4: "stroke-series-4",
  5: "stroke-series-5",
  6: "stroke-series-6",
  other: "stroke-series-other",
};
/** The n-th category's colour (from 0), in the fixed order; never cycled. */
const slot = (i: number): Tone => (i < 6 ? ((i + 1) as Tone) : "other");

export type Series = { name: string; tone: Tone };
/** One step along the bottom (a month, a week): a value per series, and where a click goes. */
export type Point = { label: string; longLabel: string; values: bigint[]; href: string };

function Legend({ series }: { series: Series[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1">
          <span aria-hidden className={`size-2 rounded-sm ${BG[s.tone]}`} /> {s.name}
        </span>
      ))}
    </span>
  );
}

function Frame({
  label,
  series,
  children,
}: {
  label: string;
  series?: Series[];
  children: ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        {/* one series: the title names it; two or more: a legend */}
        {series && series.length > 1 ? <Legend series={series} /> : null}
      </figcaption>
      {children}
    </figure>
  );
}

/** The numbers for the mark being pointed at; kept inside the card at either end. */
function Tip({ at, of, children }: { at: number; of: number; children: ReactNode }) {
  const side =
    of > 2 && at === 0
      ? "left-0"
      : of > 2 && at === of - 1
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md bg-ink px-2 py-1 text-[11px] leading-4 whitespace-nowrap text-surface tabular-nums shadow group-hover:block group-focus-visible:block ${side}`}
    >
      {children}
    </span>
  );
}

const sentence = (series: Series[], values: bigint[]) =>
  series.map((s, i) => `${s.name.toLowerCase()} ${formatRupiah(values[i] ?? 0n)}`).join(", ");

function TipRows({ series, values }: { series: Series[]; values: bigint[] }) {
  return series.map((s, i) => (
    <span key={s.name} className="flex items-center gap-1.5">
      <span aria-hidden className={`size-2 rounded-sm ${BG[s.tone]}`} />
      {s.name} <span className="ml-auto pl-2">{formatRupiahShort(values[i] ?? 0n)}</span>
    </span>
  ));
}

/** Columns standing on one baseline, the label of each under it. */
function Columns<P extends Point>({
  points,
  children,
}: {
  points: P[];
  children: (p: P, i: number) => ReactNode;
}) {
  return (
    <ul className="flex h-32 items-end gap-2">
      {points.map((p, i) => (
        <li key={p.label} className="relative flex h-full min-w-0 flex-1 flex-col">
          {children(p, i)}
        </li>
      ))}
    </ul>
  );
}

/** Bars side by side per step, one per series. A click shows only that step. */
export function BarChart({
  series,
  points,
  label,
}: {
  series: Series[];
  points: Point[];
  label: string;
}) {
  const max = biggest(points.flatMap((p) => p.values));
  return (
    <Frame label={label} series={series}>
      <Columns points={points}>
        {(p, i) => (
          <Link
            href={p.href}
            aria-label={`${p.longLabel}: ${sentence(series, p.values)}. Show only ${p.longLabel}.`}
            className="group relative flex h-full flex-col justify-end rounded-md px-0.5 transition-colors hover:bg-ground"
          >
            <Tip at={i} of={points.length}>
              <span className="block font-medium">{p.longLabel}</span>
              <TipRows series={series} values={p.values} />
            </Tip>
            <span className="flex h-full items-end justify-center gap-0.5 border-b border-line">
              {series.map((s, j) => (
                <span
                  key={s.name}
                  className={`w-1/3 max-w-4 rounded-t ${BG[s.tone]} transition-opacity group-hover:opacity-80`}
                  style={{ height: `${percent(p.values[j] ?? 0n, max)}%` }}
                />
              ))}
            </span>
            <span className="mt-1 truncate text-center text-[11px] text-muted">{p.label}</span>
          </Link>
        )}
      </Columns>
    </Frame>
  );
}

/** Money in vs out per period, side by side. */
export function InOutBars({
  periods,
  label,
}: {
  periods: { label: string; longLabel: string; cameIn: bigint; wentOut: bigint; href: string }[];
  label: string;
}) {
  return (
    <BarChart
      label={label}
      series={[
        { name: "Came in", tone: "in" },
        { name: "Went out", tone: "out" },
      ]}
      points={periods.map((p) => ({ ...p, values: [p.cameIn, p.wentOut] }))}
    />
  );
}

/**
 * Each step's parts stacked into one bar (what the month's spending was made of). Each part is
 * its own link (`hrefs`, one per series: that part in that step); the label under the bar shows
 * the whole step.
 */
export function StackedBars({
  series,
  points,
  label,
}: {
  series: Series[];
  points: (Point & { hrefs: string[] })[];
  label: string;
}) {
  const max = biggest(points.map((p) => sum(p.values)));
  return (
    <Frame label={label} series={series}>
      <Columns points={points}>
        {(p, i) => {
          const parts = series
            .map((s, j) => ({ s, value: p.values[j] ?? 0n, href: p.hrefs[j] ?? p.href }))
            .filter((part) => part.value > 0n);
          return (
            <>
              {/* bottom up, a 2px gap between parts; only the top one is rounded */}
              <span className="flex h-full flex-col-reverse items-center gap-0.5 border-b border-line">
                {parts.map((part, k) => (
                  <Link
                    key={part.s.name}
                    href={part.href}
                    aria-label={`${part.s.name}, ${p.longLabel}: ${formatRupiah(part.value)}. Show only these.`}
                    className={`group relative w-1/2 max-w-8 min-h-px ${k === parts.length - 1 ? "rounded-t" : ""} ${BG[part.s.tone]} transition-opacity hover:z-10 hover:opacity-80 focus-visible:z-10`}
                    style={{ height: `${percent(part.value, max)}%` }}
                  >
                    <Tip at={i} of={points.length}>
                      <span className="block font-medium">{p.longLabel}</span>
                      {part.s.name} · {formatRupiahShort(part.value)} of{" "}
                      {formatRupiahShort(sum(p.values))}
                    </Tip>
                  </Link>
                ))}
              </span>
              <Link
                href={p.href}
                aria-label={`${p.longLabel}: ${formatRupiah(sum(p.values))} in all. Show only ${p.longLabel}.`}
                className="mt-1 truncate rounded text-center text-[11px] text-muted hover:text-ink"
              >
                {p.label}
              </Link>
            </>
          );
        }}
      </Columns>
    </Frame>
  );
}

/**
 * A line per series over the steps, from a zero base. Pointing anywhere over a step shows a guide
 * and that step's numbers; clicking shows only that step.
 */
export function LineChart({
  series,
  points,
  label,
}: {
  series: Series[];
  points: Point[];
  label: string;
}) {
  const max = biggest(points.flatMap((p) => p.values));
  const lines = series.map((_, j) =>
    linePoints(
      points.map((p) => p.values[j] ?? 0n),
      max,
    ),
  );
  return (
    <Frame label={label} series={series}>
      <div className="relative">
        <span aria-hidden className="absolute inset-x-0 bottom-5 border-b border-line" />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
          className="absolute inset-x-0 top-0 h-[calc(100%-1.25rem)] w-full overflow-visible"
        >
          {series.map((s, j) => (
            <polyline
              key={s.name}
              points={lines[j]!.map((pt) => `${pt.x},${pt.y}`).join(" ")}
              fill="none"
              className={STROKE[s.tone]}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </svg>
        <Columns points={points}>
          {(p, i) => (
            <Link
              href={p.href}
              aria-label={`${p.longLabel}: ${sentence(series, p.values)}. Show only ${p.longLabel}.`}
              className="group relative flex h-full flex-col"
            >
              <span className="relative flex-1">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 hidden w-px bg-muted/40 group-hover:block group-focus-visible:block"
                />
                {series.map((s, j) => (
                  <span
                    key={s.name}
                    aria-hidden
                    className={`absolute left-1/2 hidden size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface group-hover:block group-focus-visible:block ${BG[s.tone]}`}
                    style={{ top: `${lines[j]![i]!.y}%` }}
                  />
                ))}
                <Tip at={i} of={points.length}>
                  <span className="block font-medium">{p.longLabel}</span>
                  <TipRows series={series} values={p.values} />
                </Tip>
              </span>
              <span className="mt-1 h-4 truncate text-center text-[11px] leading-4 text-muted">
                {p.label}
              </span>
            </Link>
          )}
        </Columns>
      </div>
    </Frame>
  );
}

const LATE_BG = ["bg-series-other", "bg-late-1", "bg-late-2", "bg-late-3", "bg-late-4"] as const;

/**
 * Money still owed by how late it is: buckets in their own order (not yet due first), each a
 * bar with the amount and the number of bills written beside it. Lateness darkens one hue; a
 * click shows only that bucket's bills.
 */
export function AgingBars({
  buckets,
  label,
}: {
  buckets: { label: string; value: bigint; count: number; href: string }[];
  label: string;
}) {
  const max = biggest(buckets.map((b) => b.value));
  return (
    <Frame label={label}>
      <ul className="flex flex-col gap-1">
        {buckets.map((b, i) => (
          <li key={b.label}>
            <Link
              href={b.href}
              aria-label={`${b.label}: ${formatRupiah(b.value)} on ${b.count} ${b.count === 1 ? "bill" : "bills"}. Show only these.`}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,8rem)_1fr_9.5rem] rounded-md px-1 py-1 text-xs transition-colors hover:bg-ground"
            >
              <span className="truncate">{b.label}</span>
              {/* on a phone the bar gets its own line under the words */}
              <span className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-line/60 sm:order-none sm:col-span-1">
                <span
                  className={`block h-full rounded-full ${LATE_BG[Math.min(i, 4)]}`}
                  style={{ width: `${percent(b.value, max)}%` }}
                />
              </span>
              <span className="text-right whitespace-nowrap tabular-nums">
                {formatRupiahShort(b.value)}
                <span className="ml-1.5 text-muted">
                  · {b.count} {b.count === 1 ? "bill" : "bills"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/**
 * Parts of one whole as a ring, the whole in the middle, and a legend with every amount (some
 * colours are light, so the numbers are always written). Pass parts in a steady order (by name,
 * say), not by size, so a part keeps its colour when filters change; past six the smallest fold
 * into "Other" (`otherHref`). A click on a part or its legend row shows only that part.
 */
export function Donut({
  parts,
  label,
  otherHref,
}: {
  parts: { label: string; value: bigint; href: string }[];
  label: string;
  otherHref: string;
}) {
  const shown = foldIntoOther(parts, 6, otherHref).filter((p) => p.value > 0n);
  const total = sum(shown.map((p) => p.value));
  const r = 40;
  const round = 2 * Math.PI * r;
  const gap = shown.length > 1 ? 1.5 : 0;
  const tone = (i: number) => ("other" in shown[i]! ? "other" : slot(i));
  const share = (v: bigint) => {
    const pct = total > 0n ? Math.round(Number((v * 1000n) / total) / 10) : 0;
    return pct === 0 && v > 0n ? "<1%" : `${pct}%`;
  };
  const say = (p: (typeof shown)[number]) =>
    `${p.label}: ${formatRupiah(p.value)}, ${share(p.value)} of ${formatRupiah(total)}. Show only these.`;
  return (
    <Frame label={label}>
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 100 100" className="size-36 shrink-0" aria-hidden>
          {/* the ring is for the mouse; keyboard and screen readers use the legend, which has the same links */}
          <g transform="rotate(-90 50 50)">
            {arcs(shown.map((p) => p.value)).map((a, i) => {
              const p = shown[i]!;
              return (
                <Link key={p.label} href={p.href} tabIndex={-1} className="group">
                  <title>{`${p.label}: ${formatRupiahShort(p.value)} (${share(p.value)})`}</title>
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    strokeWidth="14"
                    className={`${STROKE[tone(i)]} transition-[stroke-width] group-hover:[stroke-width:17] group-focus-visible:[stroke-width:17]`}
                    strokeDasharray={`${Math.max(0.5, (a.to - a.from) * round - gap)} ${round}`}
                    strokeDashoffset={-a.from * round}
                  />
                </Link>
              );
            })}
          </g>
          {/* the total in the middle never takes a click meant for the ring */}
          <g className="pointer-events-none">
            <text
              x="50"
              y="49"
              textAnchor="middle"
              className="fill-ink text-[13px] font-semibold tabular-nums"
            >
              {formatRupiahShort(total)}
            </text>
            <text x="50" y="62" textAnchor="middle" className="fill-muted text-[9px]">
              in all
            </text>
          </g>
        </svg>
        <ul className="flex max-w-sm min-w-40 flex-1 flex-col gap-0.5 text-xs">
          {shown.map((p, i) => (
            <li key={p.label}>
              <Link
                href={p.href}
                aria-label={say(p)}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto_2.5rem] items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-ground"
              >
                <span aria-hidden className={`size-2.5 rounded-sm ${BG[tone(i)]}`} />
                <span className="truncate">{p.label}</span>
                <span className="text-right tabular-nums">{formatRupiahShort(p.value)}</span>
                <span className="text-right text-muted tabular-nums">{share(p.value)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

/** The biggest parts of a whole, as horizontal bars with the amount written next to each.
 * "in" / "out" are money that moved (green +, rust −); "neutral" is an amount that just is
 * (what a customer owes). */
export function ShareBars({
  items,
  label,
}: {
  items: { label: string; value: bigint; tone: "in" | "out" | "neutral"; href: string }[];
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
              aria-label={`${item.label}: ${item.tone === "in" ? "came in " : item.tone === "out" ? "went out " : ""}${formatRupiah(item.value)}. Show only these.`}
              className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 rounded-md px-1 py-1 text-xs transition-colors hover:bg-ground"
            >
              <span className="truncate">{item.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-line/60">
                <span
                  className={`block h-full rounded-full ${item.tone === "in" ? "bg-in" : item.tone === "out" ? "bg-problem" : "bg-brand"}`}
                  style={{ width: `${percent(item.value, max)}%` }}
                />
              </span>
              <span
                className={`text-right whitespace-nowrap tabular-nums ${item.tone === "in" ? "text-in" : item.tone === "out" ? "text-problem" : ""}`}
              >
                {item.tone === "in" ? "+" : item.tone === "out" ? "−" : ""}
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
  // near an end, a label lines up with that end instead of hanging over the card's edge
  const anchor = (at: number) =>
    at < 8 ? "translate-x-0" : at > 92 ? "-translate-x-full" : "-translate-x-1/2";
  const marker = gauge.marker === null ? null : along(gauge, gauge.marker);
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-1 px-2 pt-7">
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
        {marker !== null && gauge.marker !== null ? (
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-200"
            style={{ left: `${marker}%` }}
          >
            <span
              className={`absolute -top-6 rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-surface tabular-nums ${marker < 8 ? "left-0" : marker > 92 ? "right-0" : "left-1/2 -translate-x-1/2"}`}
            >
              {format(gauge.marker)}
            </span>
            <span className="block size-4 rounded-full border-[3px] border-surface bg-ink shadow" />
          </span>
        ) : null}
      </div>
      {/* the owner's limits, in their own line under the track: they take up room, never cover text */}
      <div aria-hidden className="relative h-4">
        {limits.map((v) => (
          <span
            key={v}
            className={`absolute top-0 ${anchor(along(gauge, v))} text-[11px] leading-4 text-muted tabular-nums`}
            style={{ left: `${along(gauge, v)}%` }}
          >
            {format(v)}
          </span>
        ))}
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
