// One sentence at the top of a customer's page, in the words a non-finance person would use.
import { formatRupiahShort } from "./money";

const jakartaDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
});

/** A date column is a plain YYYY-MM-DD: that day in Jakarta, not a moment in time. */
export function longDay(date: string): string {
  return jakartaDay.format(new Date(`${date}T12:00:00+07:00`));
}

export function customerHeadline({
  owed,
  paid,
  dueOn,
  isLate,
  renewsOn,
}: {
  /** still owed across every invoice waiting for money */
  owed: bigint;
  /** already paid towards those same invoices */
  paid: bigint;
  /** earliest due date among them */
  dueOn: string | null;
  isLate: boolean;
  /** next renewal, when a subscription is running */
  renewsOn: string | null;
}): string {
  if (owed <= 0n || !dueOn) {
    return renewsOn
      ? `All paid up. Next bill on ${longDay(renewsOn)}.`
      : "All paid up. Nothing coming up.";
  }
  const amount = formatRupiahShort(owed);
  if (isLate) {
    return paid > 0n
      ? `Paid part of their bill. ${amount} is late — it was due ${longDay(dueOn)}.`
      : `${amount} is late — it was due ${longDay(dueOn)}.`;
  }
  return paid > 0n
    ? `Paid part of their bill. ${amount} left, due ${longDay(dueOn)}.`
    : `Waiting for ${amount}, due ${longDay(dueOn)}.`;
}
