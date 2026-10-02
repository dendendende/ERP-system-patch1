// The reminder sender, run every 15 minutes: claim what is due, send each once, record how it
// went. The database guarantees a reminder is handed out only once (claim_due_reminders), so
// two overlapping runs can't send the same message twice.

export type ClaimedReminder = {
  id: string;
  invoice_id: string;
  channel: string;
  template_key: string | null;
  kind: string | null;
  scheduled_for: string;
  /** what to ask them to transfer now (null once paid), as a string: bigint-safe */
  amount_to_transfer: string | null;
  still_owed: string;
};

/** A way to reach a customer. Email and WhatsApp come in P3-T4 / P3-T5. */
export interface MessageChannel {
  send(reminder: ClaimedReminder): Promise<{ providerMessageId: string; amountShown?: bigint }>;
}

export type SenderStore = {
  failStaleClaims(): Promise<number>;
  claim(limit: number): Promise<ClaimedReminder[]>;
  record(
    id: string,
    result: { sent: true; providerMessageId: string; amountShown?: bigint } | { sent: false; error: string },
  ): Promise<void>;
};

/** "08-19" → 08:00 up to (not including) 19:00, Asia/Jakarta. */
export function withinSendingHours(now: Date, hours = "08-19"): boolean {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(hours);
  if (!match) throw new Error(`REMINDER_SEND_HOURS must look like 08-19, got "${hours}"`);
  const [start, end] = [Number(match[1]), Number(match[2])];
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" })
      .format(now),
  );
  return hour >= start && hour < end;
}

export async function runSender({
  store,
  channels,
  now = new Date(),
  hours,
  limit = 50,
}: {
  store: SenderStore;
  channels: Record<string, MessageChannel>;
  now?: Date;
  hours?: string;
  limit?: number;
}) {
  if (!withinSendingHours(now, hours)) return { skipped: "outside sending hours" as const };

  const stale = await store.failStaleClaims();
  const due = await store.claim(limit);
  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    try {
      const channel = channels[reminder.channel];
      if (!channel) throw new Error(`No way to send by ${reminder.channel} yet`);
      const result = await channel.send(reminder);
      // remember the exact amount the message asked for; what is owed changes, this must not
      const amountShown =
        result.amountShown ??
        (reminder.amount_to_transfer ? BigInt(reminder.amount_to_transfer) : undefined);
      await store.record(reminder.id, { sent: true, ...result, amountShown });
      sent++;
    } catch (e) {
      await store.record(reminder.id, {
        sent: false,
        error: e instanceof Error ? e.message : String(e),
      });
      failed++;
    }
  }
  return { claimed: due.length, sent, failed, stale };
}
