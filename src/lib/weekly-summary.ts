// The owner's weekly summary: one short message, the week in money. Written by the app; sent by a
// person (or Cowork) while automatic sending is on hold.
import { formatRupiahShort } from "./money";

export type WeeklySummaryData = {
  weekFrom: string; // YYYY-MM-DD, Monday
  weekTo: string; // YYYY-MM-DD, Sunday
  cash: bigint;
  cameIn: bigint;
  wentOut: bigint;
  late: { name: string; owed: bigint }[];
  health: "healthy" | "warning" | "danger" | null;
  /** bills the owner marked paid without a transfer, this week */
  markedPaid: { customer: string; number: string; amount: bigint; reason: string }[];
  /** accounts whose balance didn't add up this week */
  mismatches: { account: string; cause: string | null }[];
};

const HEALTH = {
  healthy: "Business health: looks healthy.",
  warning: "Business health: something needs watching.",
  danger: "Business health: something needs attention.",
} as const;

const day = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function weeklySummaryText(d: WeeklySummaryData) {
  const net = d.cameIn - d.wentOut;
  const lines = [
    `Week of ${day(d.weekFrom)} – ${day(d.weekTo)}`,
    "",
    `Cash in the bank: ${formatRupiahShort(d.cash)}.`,
    `Came in ${formatRupiahShort(d.cameIn)}, went out ${formatRupiahShort(d.wentOut)} (${
      net >= 0n ? `+${formatRupiahShort(net)}` : `−${formatRupiahShort(-net)}`
    }).`,
  ];
  if (d.late.length) {
    lines.push("", `Late paying (${d.late.length}):`);
    for (const l of d.late.slice(0, 5)) lines.push(`- ${l.name}: ${formatRupiahShort(l.owed)}`);
    if (d.late.length > 5) lines.push(`- and ${d.late.length - 5} more`);
  } else {
    lines.push("", "Nobody is late paying.");
  }
  if (d.health) lines.push("", HEALTH[d.health]);
  if (d.markedPaid.length) {
    lines.push("", "Marked paid without a transfer this week — please check:");
    for (const m of d.markedPaid)
      lines.push(`- ${m.customer}, ${m.number}: ${formatRupiahShort(m.amount)} (“${m.reason}”)`);
  }
  if (d.mismatches.length) {
    lines.push("", "Bank balance didn't add up:");
    for (const m of d.mismatches) lines.push(`- ${m.account}${m.cause ? `: ${m.cause}` : ""}`);
  }
  return lines.join("\n");
}

/** Monday–Sunday of the week before the one `today` is in. */
export function lastWeek(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - sinceMonday - 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}
