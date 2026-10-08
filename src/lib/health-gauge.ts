import type { HealthStatus } from "./health-status";

// A health check drawn as a gauge: a track coloured by the owner's limits (from health_thresholds,
// never hardcoded), and a marker where the business is today.

export type Direction = "higher_is_better" | "lower_is_better";
export type Zone = { from: number; to: number; status: HealthStatus };
export type Gauge = { min: number; max: number; zones: Zone[]; marker: number | null };

/** Percent of the way along the track, 0–100, for a value on [min, max]. */
export const along = (g: Gauge, v: number) =>
  Math.min(100, Math.max(0, ((v - g.min) / (g.max - g.min)) * 100));

export function healthGauge(
  value: number | null,
  healthy: number,
  warning: number | null,
  direction: Direction,
  /** Percentages run 0–100; other signals stretch to fit the value and the limits. */
  percent: boolean,
): Gauge {
  const far = Math.max(Math.abs(healthy), Math.abs(warning ?? 0), Math.abs(value ?? 0));
  const [min, max] = percent
    ? [0, 100]
    : healthy === 0 && warning === null
      ? [-(far || 1) * 1.25, (far || 1) * 1.25] // net cashflow: zero in the middle
      : [0, Math.max(far * 1.25, healthy * 2)];
  // without a warning limit, everything on the wrong side of "healthy" is "keep an eye on it"
  const w = warning ?? healthy;
  const zones: Zone[] =
    direction === "higher_is_better"
      ? [
          { from: min, to: w, status: warning === null ? "warning" : "danger" },
          { from: w, to: healthy, status: "warning" },
          { from: healthy, to: max, status: "healthy" },
        ]
      : [
          { from: min, to: healthy, status: "healthy" },
          { from: healthy, to: w, status: "warning" },
          { from: w, to: max, status: warning === null ? "warning" : "danger" },
        ];
  return {
    min,
    max,
    zones: zones.filter((z) => z.to > z.from),
    marker: value === null ? null : Math.min(max, Math.max(min, value)),
  };
}
