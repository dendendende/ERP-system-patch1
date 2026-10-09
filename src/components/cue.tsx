import Link from "next/link";
import type { ReactNode } from "react";
import type { HealthStatus } from "@/lib/health-status";
import { formatRupiah, formatRupiahShort } from "@/lib/money";
import type { Trend } from "@/lib/trend";
import { Sparkline } from "./charts";
import { Skeleton } from "./ui";

// The Cue (P7-T5): one number that is also a door. Click it and the list behind the number opens,
// already filtered. Wide tiles for rupiah, normal ones for counts. Each cue can be its own
// <Suspense> with a <CueSkeleton> fallback, so one slow number never holds up the page.

const STATUS = {
  healthy: { bar: "bg-in", words: "healthy" },
  warning: { bar: "bg-attention", words: "keep an eye on it" },
  danger: { bar: "bg-problem", words: "needs attention" },
} as const;

export type CueProps = {
  label: string;
  /** null = not enough data yet: a dash, never 0 */
  value: bigint | number | null;
  /** "rupiah" is written as money; anything else follows the number ("customers", "months"). */
  unit: string;
  /** The list that produced this number, filtered to it. */
  href: string;
  /** Change vs the period before; `against` says which ("vs last month"). */
  trend?: Trend & { against: string };
  /** From the owner's health limits, never hardcoded. */
  status?: HealthStatus | null;
  /** Full-width-of-two tile with the exact rupiah; normal tiles round ("Rp 6,4 jt"). */
  wide?: boolean;
  /** One short line under the number. */
  caption?: string;
  /** Recent values, oldest first: a small line on wide tiles. */
  spark?: number[];
};

const trendWords = (t: Trend) =>
  t.direction === "flat"
    ? "no change"
    : `${t.direction === "up" ? "up" : "down"}${t.percent === null ? "" : ` ${Math.abs(t.percent)}%`}`;

export function Cue({ label, value, unit, href, trend, status, wide, caption, spark }: CueProps) {
  const shown =
    value === null
      ? "—"
      : unit === "rupiah"
        ? (wide ? formatRupiah : formatRupiahShort)(BigInt(value))
        : `${value.toLocaleString("id-ID")}`;
  const said = [
    `${label}: ${value === null ? "not enough data yet" : unit === "rupiah" ? formatRupiah(BigInt(value)) : `${shown} ${unit}`}`,
    trend ? `${trendWords(trend)} ${trend.against}` : null,
    status ? STATUS[status].words : null,
    caption,
    "Open the list",
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Link
      href={href}
      aria-label={said}
      className={`group relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(16_38_95/0.04)] transition-[border-color,box-shadow] hover:border-brand/40 hover:shadow-md ${wide ? "col-span-2" : ""}`}
    >
      {status ? (
        <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${STATUS[status].bar}`} />
      ) : null}
      <span className="flex items-center justify-between gap-2 text-sm text-muted">
        <span className="truncate">{label}</span>
        <span
          aria-hidden
          className="text-brand opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100"
        >
          →
        </span>
      </span>
      <span className="flex items-end justify-between gap-3">
        <span
          className={`truncate font-semibold tracking-tight tabular-nums ${wide ? "text-2xl md:text-3xl" : "text-2xl"}`}
        >
          {shown}
          {unit === "rupiah" || value === null ? null : (
            <span className="ml-1.5 text-sm font-normal text-muted">{unit}</span>
          )}
        </span>
        {wide && spark ? <Sparkline values={spark} className="mb-1 h-8 w-24 shrink-0" /> : null}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        {trend ? (
          <span
            className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
              trend.good === null ? "" : trend.good ? "text-in" : "text-problem"
            }`}
          >
            <span aria-hidden>
              {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "■"}
            </span>
            {trendWords(trend).replace(/^(up|down) /, "")}
            <span className="font-normal text-muted">{trend.against}</span>
          </span>
        ) : null}
        {caption ? <span className="truncate">{caption}</span> : null}
      </span>
    </Link>
  );
}

/** Same shape as a cue, while its number loads. */
export function CueSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div
      aria-hidden
      className={`flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 ${wide ? "col-span-2" : ""}`}
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/** Rows of cues: two to a row on phones, four on wide screens; a wide cue takes two. */
export function CueGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </section>
  );
}
