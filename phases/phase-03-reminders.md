# Phase 3 — Reminder Engine (WhatsApp + Email)

**Goal:** customers get the right reminder at the right time, and reminders stop the moment they pay.
**Branch:** `phase-3-reminders`
**Needs from human:** WhatsApp Business API provider sandbox + approved utility templates;
email provider API key (test mode).

---

### P3-T1 — Reminder tables and schedule config
- `reminder_schedule`: `id`, `offset_days` (e.g. −14, −7, −1, +3, +7, +14), `kind` (`invoice` | `reminder`
  | `due_tomorrow` | `overdue` | `escalate_team`), `channels` (`whatsapp`, `email`), `template_key`, `is_active`.
- `reminders`: `id`, `invoice_id`, `schedule_id`, `channel`, `scheduled_for`, `status` (`scheduled` |
  `sent` | `delivered` | `read` | `failed` | `cancelled`), `provider_message_id`, `amount_shown bigint`,
  `sent_at`, `error`.
- Seed default schedule: −14 invoice, −7 reminder, −1 due tomorrow, +3 overdue, +7 overdue, +14 escalate to team.
- **Done when:** migrations + seed + RLS done.

### P3-T2 — Scheduler job
- When an invoice is created, create its `scheduled` reminders from the active schedule.
- Sender job every 15 minutes: send due reminders within business hours (08:00–19:00 Asia/Jakarta, configurable).
- **Done when:** no reminder is ever sent twice (idempotency test).

### P3-T3 — Stop rules **[REVIEW]**
Before sending any reminder, re-check at send time:
1. Invoice fully paid → cancel all remaining reminders, send one "payment received, thank you".
2. Partly paid → message shows the **remaining balance** and its **new unique amount**.
3. Overdue kinds (+3, +7) send only if the bank has synced successfully **after** the due date;
   otherwise wait and retry.
4. Paused customer/invoice → skip.
5. Voided invoice → cancel all.
- **Done when:** unit tests cover every rule, including "paid this morning, sync not yet run".

### P3-T4 — Email adapter and templates
- `MessageChannel` interface; email implementation (test mode). Invoice email includes a PDF invoice.
- Templates in Bahasa Indonesia and English; company bank account number read from **config only**.
- Every template includes: "We only accept payment to [account]. We will never change it by message."
- **Done when:** emails render correctly in test inbox.

### P3-T5 — WhatsApp adapter and templates
- Official WhatsApp Business API provider, **utility** templates only. Start with a mock adapter;
  switch to sandbox when credentials exist (otherwise mark BLOCKED and continue).
- Template variables: customer name, invoice number, amount to transfer, due date, fixed account number.
- **Done when:** sandbox message delivered to a test number.

### P3-T6 — Delivery status webhooks **[REVIEW]**
- Receive delivered/read/failed events; **verify signatures**; update `reminders.status`.
- Failed WhatsApp → fall back to email for that reminder.
- **Done when:** unsigned or tampered webhook requests are rejected (tested).

### P3-T7 — Timeline on customer detail
- Past and scheduled reminders, payments received, and statuses (Read, Delivered, Failed).
- Buttons: "Send reminder now" (respects stop rules), "Pause reminders" (audited).
- **Done when:** matches the canvas "What we've sent them" section.

### P3-T8 — Reminder schedule settings (owner)
- Edit offsets, channels, active flags; preview each template with sample data.
- **Done when:** changes apply to future reminders only, not already-sent ones.

### P3-T9 — Team escalation
- +14 step creates a task on Home ("Call PT X, 34 days late") instead of messaging the customer.
- **Done when:** escalation appears in Home's Today list data.

---

## Phase 3 acceptance
- [ ] No duplicate sends; no reminders after payment (tested)
- [ ] Overdue never sent before a post-due-date sync (tested)
- [ ] Webhook signatures enforced (tested)
- [ ] Human reviewed P3-T3, P3-T6
