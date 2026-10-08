// One place that turns a health status into a colour and an order. The status itself always
// comes from the database (health_status() against the owner's limits in health_thresholds),
// so colours follow the owner's thresholds and are never decided in the UI.
import type { Tone } from "@/components/ui";

export type HealthStatus = "healthy" | "warning" | "danger";

export const HEALTH_TONE: Record<HealthStatus, Tone> = {
  healthy: "in",
  warning: "attention",
  danger: "problem",
};

export const HEALTH_RANK: Record<HealthStatus, number> = { healthy: 0, warning: 1, danger: 2 };

/** The worst of several statuses (overall health = the worst signal); null when there are none. */
export function worstStatus(statuses: readonly string[]): HealthStatus | null {
  return statuses.reduce<HealthStatus | null>((worst, s) => {
    if (!(s in HEALTH_RANK)) return worst;
    const status = s as HealthStatus;
    return worst === null || HEALTH_RANK[status] > HEALTH_RANK[worst] ? status : worst;
  }, null);
}
