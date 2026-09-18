# PROGRESS

**Current phase:** 0
**Current branch:** phase-0-setup
**Last updated:** (Claude Code updates this after every task)

## How to use
- Tick a task only after its tests pass and it is committed.
- Add a short note after each ticked task: what was done, anything the next session must know.
- `[REVIEW]` tasks: tick only after the human confirms. Until then mark as `⏸ awaiting review`.
- If interrupted mid-task, the next session starts by running `git status` and resuming that task.

## Blockers
- (none yet — e.g. "P1-T4 blocked: aggregator sandbox key not provided")

## Decisions log
- (record any decision made during the build, with date)

---

## Phase 0 — Setup
- [ ] P0-T1 Initialize project
- [ ] P0-T2 Design tokens and base components
- [ ] P0-T3 Testing and CI
- [ ] P0-T4 Supabase and migrations
- [ ] P0-T5 Auth, 2FA, roles [REVIEW]
- [ ] P0-T6 Audit log [REVIEW]
- [ ] P0-T7 App shell
- [ ] Phase 0 acceptance passed → merge

## Phase 1 — Bank data
- [ ] P1-T1 Bank tables [REVIEW]
- [ ] P1-T2 CSV import
- [ ] P1-T3 Sync engine with adapter interface [REVIEW]
- [ ] P1-T4 Real aggregator adapter
- [ ] P1-T5 Categories
- [ ] P1-T6 Entries and rules engine [REVIEW]
- [ ] P1-T7 Money in & out screen
- [ ] P1-T8 Needs-label inbox
- [ ] P1-T9 Transaction detail
- [ ] P1-T10 Bank connections screen
- [ ] P1-T11 Categories & rules screen
- [ ] Phase 1 acceptance passed → merge

## Phase 2 — Customers & billing
- [ ] P2-T1 Customers and subscriptions tables
- [ ] P2-T2 Invoices and unique amounts [REVIEW]
- [ ] P2-T3 Payments and invoice status [REVIEW]
- [ ] P2-T4 Matching engine [REVIEW]
- [ ] P2-T5 Auto-invoicing job
- [ ] P2-T6 Customer list
- [ ] P2-T7 Customer detail
- [ ] P2-T8 Invoice and subscription forms
- [ ] P2-T9 Manual matching and mark-as-paid [REVIEW]
- [ ] Phase 2 acceptance passed → merge

## Phase 3 — Reminders
- [ ] P3-T1 Reminder tables and schedule config
- [ ] P3-T2 Scheduler job
- [ ] P3-T3 Stop rules [REVIEW]
- [ ] P3-T4 Email adapter and templates
- [ ] P3-T5 WhatsApp adapter and templates
- [ ] P3-T6 Delivery status webhooks [REVIEW]
- [ ] P3-T7 Timeline on customer detail
- [ ] P3-T8 Reminder schedule settings
- [ ] P3-T9 Team escalation
- [ ] Phase 3 acceptance passed → merge

## Phase 4 — Home & health
- [ ] P4-T1 Reporting queries
- [ ] P4-T2 Daily balance check
- [ ] P4-T3 Health signals [REVIEW]
- [ ] P4-T4 Home screen
- [ ] P4-T5 Business health screen
- [ ] P4-T6 Health limits settings
- [ ] Phase 4 acceptance passed → merge

## Phase 5 — Forecast & pipeline
- [ ] P5-T1 Recurring expenses
- [ ] P5-T2 Forecast engine [REVIEW]
- [ ] P5-T3 Forecast screen
- [ ] P5-T4 Renewal pipeline
- [ ] P5-T5 Weekly owner summary
- [ ] Phase 5 acceptance passed → merge

## Phase 6 — Security & launch
- [ ] P6-T1 Audit log screen
- [ ] P6-T2 Team and roles screen
- [ ] P6-T3 Security hardening [REVIEW]
- [ ] P6-T4 First-time setup guide
- [ ] P6-T5 Polish and accessibility
- [ ] P6-T6 Production launch [REVIEW]
- [ ] Phase 6 acceptance passed → go live

## Session notes
<!-- Newest first. One line per task: date · task id · what happened · next step -->
