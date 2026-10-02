# Phase 5 — Cash Forecast, Renewal Pipeline, Weekly Summary

**Goal:** the owner sees what's coming, not just what happened.
**Branch:** `phase-5-forecast`

---

### P5-T1a — Recurring expenses: table and pattern detection
- `recurring_expenses`: `id`, `name`, `category_id`, `expected_amount bigint`, `frequency` (`monthly` |
  `quarterly` | `yearly`), `day_of_month`, `start_date`, `end_date null`, `is_active`.
- Suggest recurring expenses from detected patterns in entries (same payee, similar amount, regular interval);
  owner confirms — never auto-create.
- **Done when:** pattern detection tests pass on seeded salary/rent data.

### P5-T1b — Recurring expenses screen
- Screen: list, add, edit, confirm suggestions.
- **Done when:** the owner confirms a suggestion and edits an expense; others can only look.

### P5-T2 — Forecast engine **[REVIEW]**
- Daily projection for the next 90 days starting from today's bank balance:
  - **In:** open invoice outstanding amounts on due date, weighted by customer's payment history
    (on-time payers 100%, often-late payers shifted by their average delay);
    future invoices from active subscriptions.
  - **Out:** recurring expenses on their expected dates.
- Output per day: expected balance; plus lowest point (date + amount) and the main drivers.
- Deterministic and fully unit-tested; assumptions listed in code comments and shown in UI.
- **Done when:** tests on a fixed dataset match hand-calculated results.

### P5-T3 — Forecast screen
- Headline: "In 60 days you'll have about Rp X. Lowest point is [date], after [driver]."
- Line chart of the 90 days, lowest point marked; list of biggest upcoming ins and outs.
- Plain note: "Forecast assumes customers pay like they usually do."
- **Done when:** owner and viewer can see it; operator cannot (configurable).

### P5-T4 — Renewal pipeline
- Subscriptions renewing in the next 30 / 60 days.
- Risk flags: paid late last cycle, unread reminders, partial payment history, recently paused.
- Actions: open customer, send reminder now.
- **Done when:** risk flags correct on seeded data (tested).

### P5-T5 — Weekly owner summary
- Monday 08:00 Asia/Jakarta, WhatsApp to owner(s) (email fallback).
- Content: cash, came in / went out last week, who's late, health status, any owner-only manual
  "mark as paid" actions, any balance mismatches.
- Template preview in Settings.
- **Done when:** summary generated correctly for seed data; sent via sandbox.

---

## Phase 5 acceptance
- [ ] Forecast math tested against hand calculation
- [ ] Recurring expenses never auto-created without confirmation
- [ ] Weekly summary includes manual mark-as-paid actions
- [ ] Human reviewed P5-T2
