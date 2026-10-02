# PROGRESS

**Current phase:** 2
**Current branch:** phase-2-billing (branched from phase-1-bank-data)
**Last updated:** 2026-09-21

## How to use
- Tick a task only after its tests pass and it is committed.
- Add a short note after each ticked task: what was done, anything the next session must know.
- `[REVIEW]` tasks: tick only after the human confirms. Until then mark as `⏸ awaiting review`.
- If interrupted mid-task, the next session starts by running `git status` and resuming that task.

## Blockers
- P1-T4 blocked: need the bank aggregator choice + sandbox API key (and webhook secret if it uses webhooks). Sync works with BANK_ADAPTER=mock meanwhile; the real adapter only has to implement BankSourceAdapter in src/lib/bank/adapter.ts.
- P1-T2b blocked: need sample CSV statements (real data removed) from each bank the business uses. P1-T2a ships a documented template CSV meanwhile.
- Only if automatic sending is turned back on — P3-T4b real email: need the email provider choice (e.g. Resend or Postmark) + a TEST-MODE key and a sending domain. Emails go to the local Mailpit test inbox meanwhile (REMINDER_CHANNELS=mock); the real provider only has to implement EmailTransport in src/lib/reminders/email.ts.
- Only if automatic sending is turned back on — P3-T6: delivery webhooks (delivered / read / failed) come from the email provider — needs the same provider + its webhook signing secret. Signature checking can only be tested against its real format.
- P0-T3 / P0-T7 / Phase 0 acceptance: "CI green", "deploy to Vercel preview" and "login with 2FA on preview" need the human: push the branch, and provide the staging Supabase project + Vercel project (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SESSION_TIMEOUT_MINUTES in Vercel). Local equivalents all pass.

## Decisions log
- 2026-09-18 · Next.js 16 scaffold: `typecheck` runs `next typegen` first (route types like `LayoutProps` are generated). Next 16 renamed `middleware` → `proxy`.
- 2026-09-18 · Vitest installed in P0-T1 so `pnpm test` works from the first task; P0-T3 adds Playwright + CI.
- 2026-09-18 · Role helper is `current_app_role()` (not `current_role()`: CURRENT_ROLE is a reserved SQL keyword). It returns NULL unless the JWT is aal2, so RLS itself enforces 2FA.
- 2026-09-18 · Session timeout is app-side (proxy `last_active` cookie, SESSION_TIMEOUT_MINUTES, default 30) — works on every Supabase plan.
- 2026-09-18 · Public sign-up disabled; the owner adds people (P6-T2). `[auth.email] enable_signup` must stay true or email login is disabled entirely.
- 2026-09-19 · `withAudit()` is implemented in the database, not app code: `select enable_audit('table')` attaches a trigger that writes audit rows in the same transaction; the reason is passed with `set_config('app.audit_reason', ..., true)` inside the RPC doing the write. Every money table must call enable_audit in its migration.
- 2026-09-19 · CSV external_id uses "n-th identical row in the file" instead of "row sequence within the same day": a statement that starts mid-day would shift day sequences and re-import duplicates; identical-row counting stays stable. Statements with any unreadable row are not imported at all.
- 2026-09-19 · e2e tests use their own seed users (e2e-owner@, e2e-operator@) and run with workers: 1; demo users keep their 2FA.

---
- 2026-09-27 · Reminders remind the TEAM, not the customer (owner). Automatic sending is ON HOLD: the sender route refuses unless REMINDER_AUTO_SEND=on, and its cron is removed from vercel.json. Due reminders appear on Home ("Reminders to send") with the message ready to copy, open in email/WhatsApp, or hand to Cowork; a person marks it sent or skips it (who + when recorded). The same stop rules decide what is on the list. The automatic sender, email channel and templates stay in the code for later.
- 2026-10-02 · Database test files now run one at a time (vitest fileParallelism: false). Several tests switch off every bank account or bill inside their transaction; in parallel those row locks occasionally deadlocked. ~13s for the full suite.

## Phase 0 — Setup
- [x] P0-T1 Initialize project
- [x] P0-T2 Design tokens and base components
- [x] P0-T3 Testing and CI
- [x] P0-T4 Supabase and migrations
- [x] P0-T5 Auth, 2FA, roles [REVIEW]
- [x] P0-T6 Audit log [REVIEW]
- [x] P0-T7 App shell
- [x] Phase 0 acceptance passed → merge (human approved 2026-09-19; CI-on-GitHub + Vercel preview still pending — see Blockers; not merged to main yet)

## Phase 1 — Bank data
- [x] P1-T1 Bank tables [REVIEW]
- [x] P1-T2a CSV import: template format, external_id, preview, idempotent import
- [ ] P1-T2b CSV parsers per bank (blocked: needs sample statements)
- [x] P1-T3 Sync engine with adapter interface [REVIEW]
- [ ] P1-T4 Real aggregator adapter — BLOCKED (no sandbox key)
- [x] P1-T5 Categories
- [x] P1-T6a Entries, rules, engine [REVIEW]
- [x] P1-T6b Own-transfer detection [REVIEW]
- [x] P1-T7 Money in & out screen
- [x] P1-T8 Needs-label inbox
- [x] P1-T9 Transaction detail
- [x] P1-T10 Bank connections screen
- [x] P1-T11 Categories & rules screen
- [x] Phase 1 acceptance passed → merge (re-sync/re-import idempotent ✓, bank rows immutable ✓, 95.5% of fake transactions auto-labelled after 11 rules ✓, P1-T1/T3/T6 reviewed ✓; P1-T2b and P1-T4 still blocked, not merged to main yet)

## Phase 2 — Customers & billing
- [x] P2-T1 Customers and subscriptions tables
- [x] P2-T2 Invoices and unique amounts [REVIEW]
- [x] P2-T3 Payments and invoice status [REVIEW]
- [x] P2-T4 Matching engine [REVIEW]
- [x] P2-T5 Auto-invoicing job
- [x] P2-T6 Customer list
- [x] P2-T7 Customer detail
- [x] P2-T8a Invoice form
- [x] P2-T8b Subscription form
- [x] P2-T9 Manual matching and mark-as-paid [REVIEW]
- [x] Phase 2 acceptance passed → merge (all four checks pass locally; 172 unit/DB + 25 e2e green — not merged to main yet: push/CI/Vercel still pending, see Blockers)

## Phase 3 — Reminders
- [x] P3-T1 Reminder tables and schedule config
- [x] P3-T2 Scheduler job
- [x] P3-T3 Stop rules [REVIEW]
- [x] P3-T4a Message templates
- [x] P3-T4b Email channel with PDF invoice
- [ ] P3-T5 WhatsApp adapter and templates — ⏭ deferred by human (2026-09-27): not needed now; all reminders go by email meanwhile
- [ ] P3-T6 Delivery status webhooks [REVIEW] — ⏸ on hold with automatic sending (nothing is sent by a provider, so there are no delivery events)
- [x] P3-T7 Timeline on customer detail
- [x] P3-T8 Reminder schedule settings
- [x] P3-T9 Team escalation
- [ ] Phase 3 acceptance passed → merge — with automatic sending on hold: no duplicate sends / none after payment ✓, overdue never before a post-due bank read ✓ (also on the team list); webhook checks + P3-T6 review are moot until sending is automatic again — owner to decide whether Phase 3 counts as done

## Phase 4 — Home & health
- [x] P4-T1 Reporting queries
- [x] P4-T2 Daily balance check
- [x] P4-T3 Health signals [REVIEW]
- [x] P4-T4 Home screen
- [x] P4-T5 Business health screen
- [x] P4-T6 Health limits settings
- [ ] Phase 4 acceptance passed → merge — 3 of 4: report numbers match hand-calculated values ✓, balance mismatch detection ✓, health boundaries ✓; waiting on the human to check the Home and Business health screens (no canvas file here to compare against)

## Phase 5 — Forecast & pipeline
- [x] P5-T1a Recurring expenses: table and pattern detection
- [x] P5-T1b Recurring expenses screen
- [x] P5-T2 Forecast engine [REVIEW]
- [x] P5-T3 Forecast screen
- [x] P5-T4 Renewal pipeline
- [x] P5-T5 Weekly owner summary
- [x] Phase 5 acceptance passed → merge — forecast math matches the hand calculation ✓, recurring expenses never auto-created ✓, weekly summary includes manual mark-as-paid ✓, P5-T2 reviewed ✓; automatic Monday sending held with the rest of the sending (not merged — git is the human's)

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
- 2026-09-18 · P0-T1 · Next.js 16 + TS strict + pnpm, ESLint/Prettier, scripts, .env.example; build/typecheck pass · next: P0-T2
- 2026-09-18 · P0-T2 · tokens in globals.css @theme, components in src/components/ui.tsx, formatRupiah/formatRupiahShort in src/lib/money.ts (+tests), showcase at /dev/components · next: P0-T3
- 2026-09-18 · P0-T3 · Vitest (vitest.config.ts), Playwright smoke on desktop+phone (builds + starts on :3100), .github/workflows/ci.yml; all green locally — CI run on GitHub not yet verified (branch not pushed) · next: P0-T4
- 2026-09-18 · P0-T4 · `pnpm db:start|db:reset|db:types`; migrations in supabase/migrations, DB tests in supabase/tests (pg, rolled back per test, default URL = local :54322); .env.local holds local-only keys · next: P0-T5 [REVIEW]
- 2026-09-18 · P0-T5 · implemented + committed (e936c96); RLS/route/timeout tests pass; scripted flow verified login→enroll→aal2→role guard for all 3 roles · ⏸ STOPPED for human review before P0-T6
- 2026-09-19 · P0-T5 · approved by human; open question (block demoting the last owner) deferred to P6-T2 · next: P0-T6
- 2026-09-19 · P0-T6 · implemented + committed; 7 audit tests pass · ⏸ awaiting human review · human asked to continue to P0-T7 in the same session
- 2026-09-19 · P0-T7 · (app) route group shell: sidebar (desktop) + bottom tab bar (phone), sync status placeholder, 5 stub pages; e2e/shell.spec.ts logs in with real TOTP and clicks every nav item on desktop+phone (needs `pnpm db:start`; not run in CI); fixed sign-in → enroll/verify redirect · Vercel preview deploy not done (blocker) · next: human review of P0-T6, then Phase 0 acceptance
- 2026-09-19 · P0-T6 · approved by human · next: Phase 0 acceptance (blocked on push + staging Supabase/Vercel), then Phase 1 on branch phase-1-bank-data
- 2026-09-19 · P1-T1 · bank tables + 10 DB tests (36 total pass); applied locally with `supabase migration up` (no reset, keeps local 2FA) · ⏸ STOPPED for human review
- 2026-09-19 · P1-T1 · approved by human · P1-T2 split into T2a (template CSV pipeline) + T2b (per-bank parsers, blocked on samples)
- 2026-09-19 · P1-T2a · template CSV import at /money/import; 24 parser unit tests + 2 e2e (idempotent re-import, bad-row rejection) · next: P1-T2b blocked on samples → P1-T3 [REVIEW]
- 2026-09-19 · P1-T3 · sync engine + mock adapter + cron route; 73 tests pass; live check: 1st cron call inserted 58 mock tx, 2nd inserted 0; "trigger classification" deferred to P1-T6 (entries created there) · ⏸ STOPPED for human review
- 2026-09-19 · P1-T3 · approved by human
- 2026-09-19 · review cleanup · ponytail review cuts applied; migrations edited in place (branch never deployed) and local DB reset, demo 2FA restored; 73 unit/DB + 6 e2e pass · next: P1-T4 (needs aggregator sandbox key)
- 2026-09-19 · P1-T4 · BLOCKED on aggregator sandbox key (human confirmed) · next: P1-T5
- 2026-09-19 · P1-T5 · categories table + 15 built-ins in migration, 5 DB tests (78 total pass); screen comes in P1-T11 · next: P1-T6 [REVIEW]
- 2026-09-19 · P1-T6a · entries + rules engine in DB, 12 new DB tests (90 total) · committed, review together with P1-T6b · next: P1-T6b
- 2026-09-19 · P1-T6b · own-transfer detection in the entry trigger, 5 DB tests (95 total) + 6 e2e pass; clean db reset verified · ⏸ STOPPED for human review of P1-T6a + P1-T6b
- 2026-09-20 · P1-T6 · approved by human · next: P1-T7 (Money in \& out screen)
- 2026-09-20 · P1-T7 · /money list with filters, search and paging; 10k-row query measured at 0.14ms (index scan, rolled back); search is ILIKE (add a trigram index if it ever slows) · next: P1-T8
- 2026-09-20 · P1-T8 · inbox + suggestions (pg_trgm) + payee-based rules; 104 unit\/DB and 10 e2e pass · next: P1-T9 (transaction detail)
- 2026-09-20 · P1-T9 · /money/[id] detail + history; fixed stale select after save (React keeps uncontrolled defaultValue) and hid updated_at/updated_by/rule_id from history · next: P1-T10
- 2026-09-20 · P1-T10 · /settings/bank + stale alerts (SYNC_STALE_HOURS, default 6) in sidebar and Home; 115 unit\/DB, 14 e2e pass · next: P1-T11 (categories \& rules screen, owner)
- 2026-09-20 · P1-T11 · /settings/categories (owner): rules in plain words with label counts, on/off, category add/remove; acceptance measured: 84/88 entries auto-labelled = 95.5% after 11 demo rules (local data only) · Phase 1 done except blocked P1-T2b/P1-T4
- 2026-09-21 · P2-T1 · customers + subscriptions (E.164 checked in DB), seed of 5 customers matching the mock payers; 123 tests pass; engine tests now isolated from local demo rules · next: P2-T2 [REVIEW]
- 2026-09-21 · P2-T2 · invoices + unique amounts; concurrency test (40 parallel commits) passes and fails when the lock is removed; 132 tests pass · ⏸ STOPPED for human review
- 2026-09-21 · P2-T2 · approved by human (operators may void, numbering gaps accepted) · next: P2-T3 [REVIEW]
- 2026-09-21 · P2-T3 · payments + derived invoice status + fresh unique amount for the rest; 139 tests pass · ⏸ STOPPED for human review
- 2026-09-21 · P2-T3 · approved by human (fresh code added on top for the rest) · next: P2-T4 [REVIEW]
- 2026-09-21 · P2-T4 · match_payments() after sync + CSV import (3 rules, never guesses when 2+ fit); amount_due now counts only codes actually transferred; mutation check: ambiguity tests fail without the guard; 150 unit/DB + 17 e2e pass · ⏸ STOPPED for human review
- 2026-09-23 · P2-T4 · approved by human (incl. the amount_due change to P2-T3) · next: P2-T5
- 2026-09-23 · P2-T5 · create_due_invoices() + daily cron (08:00 Jakarta); lead time 14 days, one invoice per subscription per period (unique index); verified on demo data: 2 created, second run 0; 157 tests pass · next: P2-T6
- 2026-09-23 · P2-T6 · /customers list from a customer_billing view (security_invoker); filters All/Late/Renewing soon/Active/Ended + search; 162 unit/DB + e2e filter test pass · next: P2-T7
- 2026-09-23 · P2-T7 · /customers/[id]: plain-language headline, bill cards (total/paid/still owed + bar + exact transfer amount), subscription card, reminders placeholder; 165 unit/DB + 19 e2e pass · next: P2-T8
- 2026-09-23 · P2-T8a · bill form on the customer page (write/change/cancel, role-gated); fixed duplicate field ids across repeated forms; 167 unit/DB + 21 e2e pass · next: P2-T8b
- 2026-09-23 · P2-T8b · subscription form (owner only) on the customer page; panel closes on save so a refresh never clobbers typing; 167 unit/DB + 23 e2e pass · next: P2-T9 [REVIEW]
- 2026-09-23 · P2-T9 · match a transfer to a bill by hand (owner/operator, audited) + owner-only mark-as-paid with reason (payments_without_transfer view for the weekly summary); 172 unit/DB + 25 e2e pass · ⏸ STOPPED for human review
- 2026-09-23 · P2-T9 · approved by human · next: Phase 2 acceptance
- 2026-09-23 · Phase 2 acceptance · all four checks pass (unique amounts under concurrency, partial + multi-invoice payments, ambiguity never auto-matched, human reviews done); 172 unit/DB + 25 e2e green · next: Phase 3 (blocked on push/CI/Vercel/staging + WhatsApp keys)
- 2026-09-25 · P3-T1 · reminder_schedule (default −14 invoice, −7, −1, +3, +7, +14 escalate) + reminders (one per invoice/step/channel, unique index), RLS: team reads, owner edits schedule, only jobs write reminders; 178 tests pass · next: P3-T2
- 2026-09-25 · P3-T2 · new bills queue reminders (08:00 Jakarta per step; past steps skipped except the bill; due-date moves reschedule); sender every 15 min, 08–19 Jakarta (REMINDER_SEND_HOURS), at-most-once claims (stale claims → failed, never resent), mock channel via REMINDER_CHANNELS; idempotency + 6-sender concurrency tests fail without the guard; 192 tests pass · next: P3-T3 [REVIEW]
- 2026-09-25 · P3-T3 · stop rules re-checked at send time (paid → cancel + one thank-you unless settled without a transfer; partly paid → amounts read at send; overdue waits for a bank read after it was due; paused/switched-off → skipped; void → cancel all); mutation check: overdue tests fail without the rule; 203 unit/DB + 25 e2e pass · ⏸ STOPPED for human review
- 2026-09-27 · P3-T3 · approved by human (with the read-only reminder list on the customer page); email to be built against a mock · next: P3-T4
- 2026-09-27 · P3-T4a · templates (bill, reminder, due tomorrow, overdue, thank-you) in Bahasa Indonesia + English, customers.language (default id); company account only from COMPANY_* env, missing config refuses to send; every template carries the fixed account + warning (unit tested); 220 tests pass · next: P3-T4b
- 2026-09-27 · P3-T4b · email channel (text + HTML, PDF on the bill via a small built-in PDF writer), delivered to the local Mailpit test inbox under REMINDER_CHANNELS=mock — verified: 3 real emails (Indonesian + English, PDFs open); a real provider is BLOCKED on a key (see Blockers); also fixed e2e tests that left rows/bills behind and broke later runs; 227 unit/DB + 26 e2e pass · next: P3-T5
- 2026-09-27 · P3-T5 deferred by human (WhatsApp not needed now) → default schedule switched to email for every customer step (audited), queued WhatsApp messages cancelled with a reason and re-queued by email; thank-you uses WhatsApp only if a WhatsApp message actually reached them. P3-T6 blocked on the email provider (delivery webhooks come from it) · next: P3-T7
- 2026-09-27 · P3-T7 · customer timeline: reminders + payments newest first, plain-language statuses (incl. "Waiting for a bank update"); "Send reminder now" per waiting bill (owner/operator, once per bill per day, still goes through every stop rule incl. rule 3 for hand-sent late notices); "Pause reminders" per customer with a required reason, audited; 235 unit/DB + 28 e2e pass, tests leave no data behind · next: P3-T8
- 2026-09-27 · P3-T8 · /settings/reminders (owner): days before/after, email on/off (WhatsApp shown on hold), step on/off, preview in both languages with the fixed account; every reminder not yet sent follows a change (moved, cancelled, or brought back), sent ones never touched (DB trigger, 6 tests); 241 unit/DB + 30 e2e pass · next: P3-T9
- 2026-09-27 · P3-T9 · team_escalations view: bills past the escalation step (+14) with who to call, days late and what is owed; only after a bank read since the escalation day; drops off when paid/cancelled/paused; "Call these customers" card on Home (P4-T4 folds it into the Today list); 247 unit/DB + 30 e2e pass · Phase 3: everything buildable is done; P3-T5 deferred, P3-T6 blocked on the email provider
- 2026-09-27 · Reminders switched to manual (owner): automatic sender held (REMINDER_AUTO_SEND + cron removed), Home "Reminders to send" list (one line per bill, latest due step; copy / open in email / open in WhatsApp / PDF of the bill; mark as sent or skip — records who, closes older ones it replaces); "Add a reminder to send today" on each bill; fixed: hand-sent reminders shared one provider id and collided; 254 unit/DB + 33 e2e pass
- 2026-09-30 · P4-T1 · money_summary(): cash in bank, came in / went out this month, usual month (prev 3), recurring-only spending, still owed, past due; own transfers excluded; matches a hand-calculated 2031 dataset · next: P4-T2
- 2026-09-30 · P4-T2 · balance_checks + check_balances(): every bank-balance row implies a start balance; the first that disagrees gives when and how much; causes: missing days (dated) or a doubled row (named); runs after each bank sync (one row per account per day); red banner lands with Home in P4-T4; separate owner notification skipped — no sending channel while reminders are manual · next: P4-T3 [REVIEW]
- 2026-09-30 · P4-T3 · health_thresholds (owner-editable, audited) + daily health_snapshots (taken with the daily invoicing run); one boundary rule (health_status) — every limit edge tested; net cashflow danger = 3 negative months running; overall = worst, worked out on read; 283 tests pass · ⏸ STOPPED for human review
- 2026-09-30 · P4-T3 · approved by human · next: P4-T4
- 2026-09-30 · P4-T4 · Home: headline (cash + how long it lasts), health pill → /health, came in / went out / still owed (+ past due link), 6-month in-vs-out bars in plain CSS with a screen-reader table and a trend sentence, owner-only red banner for balance mismatches, Today list (auto-matched payments, reminders sent, needs-label count) + reminders to send + calls; monthly_in_out on a shared money_moves view; customer timeline no longer lists cancelled reminders whose day never came; staging load time not measurable yet (no staging) · next: P4-T5
- 2026-09-30 · P4-T5 · /health: five checks as questions, worst first, value + sentence + safe limit + next-step link when not healthy; checks without data say "No data yet" instead of Healthy · next: P4-T6
- 2026-09-30 · P4-T6 · /settings/health (owner): safe + danger limit per check with a plain explanation; nonsense limits refused by the table itself; audited; next snapshot only (tested in P4-T3); 287 unit/DB + 38 e2e pass · Phase 4: all tasks done, acceptance waits on a screen check by the human
- 2026-10-02 · P5-T1a · recurring_expenses (owner writes, audited, never deleted) + suggest_recurring_expenses(): same payee (letters-only pattern), once a month, 3+ months with no gap, amount within ±20%, still going; read-only, confirmed or dismissed patterns never suggested again; monthly patterns only (quarterly/yearly added by hand); tests on seeded rent/salary/hosting + noise · next: P5-T1b
- 2026-10-02 · P5-T1b · /money/regular-costs: suggestions (owner adds or dismisses; nothing added by itself), list, add, change, stop; team can look. Also fixed app-wide: React 19 cleared a form's fields after every submit — even when the server refused the input — so people lost what they typed; all typed forms now submit via useFormAction (keeps input); 291 unit/DB + 39 e2e pass · next: P5-T2 [REVIEW]
- 2026-10-02 · P5-T2 · forecast() pure + deterministic (src/lib/forecast.ts), assumptions in one list shown on screen; matches a hand-calculated 90-day dataset (6 tests); customer_payment_delay view (avg days late over paid bills, early = 0); loadForecast() gathers inputs with RLS; 298 tests pass · ⏸ STOPPED for human review
- 2026-10-02 · P5-T2 · approved by human (late bills expected tomorrow; full amounts, lateness only shifts the date) · next: P5-T3
- 2026-10-02 · P5-T3 · /forecast: headline (in 60 days + lowest point + what caused it), run-out warning, 90-day SVG line zoomed to the real range with amounts and dates, biggest ins / outs, the assumptions word for word; owner + viewer only by default (FORECAST_ROLES, explicit list instead of a rank), link on Home for those roles; 302 unit/DB + 42 e2e pass · next: P5-T4
- 2026-10-02 · P5-T4 · renewal_pipeline view + /customers/renewals (30 / 60 days, risky first): paid late last time, reminders not sent yet (stands in for "unread" — sending is by hand, nobody knows what was read), pays in parts, recently paused; open customer + add a reminder (owner/operator); flags tested one by one on seeded customers; 304 unit/DB + 43 e2e pass · next: P5-T5
- 2026-10-02 · P5-T5 · weekly summary written by the app (cash, in/out last Mon–Sun, who is late, health, bills marked paid without a transfer, balance mismatches) at Settings → Weekly summary, copy or hand to Cowork; automatic Monday WhatsApp held like all sending. Found: each e2e run leaves one permanent "marked paid" payment in the dev database (removed 20) — Phase 6: run e2e on its own database; 308 unit/DB + 45 e2e pass · Phase 5 done
