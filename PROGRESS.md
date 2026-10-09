# PROGRESS

**Current phase:** 8 (Phase 6 waits on human sign-offs)
**Current branch:** main (phase file asks for `phase-6-launch` — branching is the human's call)
**Last updated:** 2026-10-09

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
- 2026-10-03 · Team invites are links the owner sends by hand (like reminders): the app makes a one-time Supabase invite link, nothing is emailed. Opening it shows a Continue button — the code is used only on that click, so chat apps previewing the link can't burn it. Switched off = is_active false (RLS: no role, no data, next query) + Supabase ban (proxy's getUser fails → signed out on the next page). Users can never be deleted (trigger, even via auth.users); the last active owner can't be demoted or switched off (locked check). Resolves the P0-T5 open question.
- 2026-10-04 · Every page is rendered per request (root layout awaits connection()): the CSP nonce only reaches pages rendered at request time. Signed-out visitors (anon) have no grants in public at all; views are read-only. Customer contact columns are not granted to the team — read them through customer_contacts() (owner/operator); a new customers column must be added to the column grant (test fails otherwise). Login rate limits count failures only, in the database.
- 2026-10-05 · Local Supabase ports moved 543xx → 443xx (API 44321, DB 44322, Studio 44323, Mailpit 44324): Windows/Hyper-V reserves ranges inside 49152–65535 (here 54163–54662) and restarting WinNAT didn't release them; below 49152 they can't be taken. Each developer updates .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_URL) to the new ports.
- 2026-10-08 · 2-step sign-in has an owner switch (owner decision: working alone for now). security_settings.require_two_factor, read by current_app_role() (RLS) and by the proxy/sign-in via two_factor_required(); ON in a new database, owner flips it on Settings → Team (audited). Switched OFF in the local dev database. DB tests force it ON per transaction and e2e force it ON for the run (global-setup restores the local value), so the tests keep checking the secure mode. Must be ON before go-live (launch.md sign-off).
- 2026-10-08 · Fixed: the daily invoicing job crashed — and billed nobody — when a subscription's renewal day had already passed (bill due before it was written is refused by the database). A late bill is now due the day it is written.
- 2026-10-08 · Corporate look (owner request): IBM Plex Sans for everything (was Newsreader + Schibsted Grotesk); cool white page, white cards, dark-grey text, one blue (brand) for actions/active filters, deep navy sidebar with line icons and a logo mark; Home opens on a dark-blue banner. Tokens in globals.css, AA contrast tested for every new pair. Sections rise in (240ms, reduced-motion respected), fill-mode backwards so nothing stays layered over popups.
- 2026-10-08 · DataTable virtualization is ~20 lines of our own (rows are one fixed height, so the visible window is arithmetic — src/lib/virtual-rows.ts), not @tanstack/react-virtual: no new dependency. The page scrolls (not a box inside it), so the header sticks to the window; on phones the table box scrolls sideways instead.
- 2026-10-08 · Money by hand (owner request): stored in bank_transactions like bank money (so every list, total, health check, forecast and bill match sees it), marked by entered_by + external_id 'hand:<form key>' (one form = one row, even on a double click), audited on insert, never changed. A mistake is cancelled by filing it under the built-in "Cancelled (entered by mistake)" category — in the 'transfer' report group, which every total already leaves out; only hand entries that paid no bill can be cancelled, and no rule may use it (triggers). Statement import warns when a row looks like a hand entry (same account/direction/amount, ±1 day); the person cancels the hand one. Details (who + note) live on entries: editable, audited, searchable.
- 2026-10-09 · Metrics (P8-T1): sums stay in SQL (one money_summary call per day asked, so 50k rows never reach the app); the formulas, trend, status and drill-down link are pure TS in lib/metrics.ts, one function per metric, all returning { value, previous, trend, status, href }. "Previous" = the same metric a month ago, same day of month (clamped). Status comes from health_thresholds via statusAgainst(), the TS copy of health_status()'s boundary rule — a DB test runs both on every limit ±0.1 so they can't drift. money_summary's cash is now the balance as of the day asked (was: latest ever). New owner limits forecast_low (floor, default Rp 0) and forecast_off (forecast accuracy, 10% / 20%) — limits only, not daily health checks.
- 2026-10-09 · Receivables history (P8-T2): what a bill owed on a day = base_amount − payments whose money had arrived by then (bank date; "marked paid": when marked), from the day it was written until the day it was cancelled — invoices.voided_at, stamped by a trigger (older ones backfilled from the audit log). Billed is base_amount, not amount_due: the unique code is only ever part of the transfer that finishes a bill, so it was never owed before. Windows: DSO = owed ÷ billed in the last 90 days × 90; CEI = last 30 days, cancelled bills taken out (not collected); bucket migration = 30 days ago → today (buckets are 30 days wide, so an unpaid bill always moves exactly one).
- 2026-10-09 · Subscription history (P8-T3): a subscription on a past day is replayed from the audit log (its full first row + every change), per column the last change by that day; before it was entered it counts as first entered, so customers added during setup with older start dates count from their start date. Running = status active, started, not ended. Sums are yearly and exact (price × 12 / 4 / 1); MRR = ARR ÷ 12 rounded once. subscription_state_on is security definer (the log is owner-only) and answers only a role or the jobs. Renewal rate and the biggest customer's share now come from renewal_counts() / revenue_by_customer(), which the daily health check calls too (one definition). Small change to the health check: concentration groups by customer (was by name) and dates income by the bank's date over the 365 days to the day (was: when matched, no end date). renewal_pipeline looks 90 days ahead (Renewals screen: 30 / 60 / 90).
- 2026-10-09 · Metric snapshots (P8-T5): taken in TS (the metric functions are TS, the forecast too) by the daily job (/api/cron/auto-invoice, 08:00 Jakarta, after the health snapshot), service-role client; same day re-run overwrites. Most "a month ago" values stay worked out live as of that day (exact, and right from day one); snapshots carry what can't be rebuilt: the forecast's low point and each month's forecast (kept on the month's first snapshot, scored from the next day to the month's end), plus history for sparklines (history(): kept days + today live). The renewal pipeline view reads the owner-only change log, which the job can't — renewals due load on their own (loadRenewalsDue) and aren't snapshotted.

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
- [x] P6-T1 Audit log screen
- [x] P6-T2 Team and roles screen
- [ ] P6-T3 Security hardening [REVIEW] — code approved by human 2026-10-05; still open: production items + owner decisions in docs/security.md (Sign-off)
  - [x] P6-T3a Headers, RLS-coverage test, service-role guard, CI secret scan + dependency audit
  - [x] P6-T3b Rate limiting and new-device sign-in alerts
  - [x] P6-T3c Personal data by role, security notes (backups, restore drill, UU PDP)
- [ ] P6-T4 First-time setup guide — built and tested; waiting on the human test (a non-tech person completes it without help, < 30 min)
- [x] P6-T5 Polish and accessibility
- [ ] P6-T6 Production launch [REVIEW] — ⏸ awaiting review; code side done, the launch itself is the human's (docs/launch.md)
- [ ] Phase 6 acceptance passed → go live

## Phase 7 — Design system v2 and floorplans (UPGRADE-v2-erp-ux.md §6)
- [x] P7-T1 Density tokens + table primitives
- [x] P7-T2 FilterBar: typed filters, chips, URL-synced state, save/load views (filter-bar.tsx + saved-views.tsx)
- [x] P7-T3 saved_views table + API [REVIEW] — approved by human 2026-10-08
- [x] P7-T4 DataTable: virtualized, sortable, column chooser, multi-select, bulk bar, totals, CSV export (50k rows at 60fps)
- [x] P7-T5 Cue tile
- [x] P7-T6 AnalyticalListPage shell
- [x] P7-T7 ObjectPage shell
- [x] P7-T8 Chart wrappers (bar, line, stacked, aging, donut; click emits a filter)
- [x] P7-T9 Command palette + global search
- [x] P7-T10 Keyboard navigation and focus across list and panel

## Phase 8 — Metrics engine and role-based Home
- [x] P8-T1 metrics module [REVIEW] — approved by human 2026-10-09 (shape + §4.1 cash metrics; §4.5 operations counts land with the operator cues in T6)
- [x] P8-T2 Aging buckets + DSO + CEI + bucket migration [REVIEW] — approved by human 2026-10-09 (split for size; reviewed together)
  - [x] P8-T2a What was owed on any day (voided_at, invoice_owed_on) + aging buckets, % overdue, 90+ share, top 10 overdue
  - [x] P8-T2b DSO, CEI, bucket migration
- [x] P8-T3 MRR/ARR, renewal rate, revenue by plan/customer, concentration [REVIEW] — approved by human 2026-10-09 (split for size; reviewed together)
  - [x] P8-T3a MRR / ARR, added vs lost this month (subscriptions replayed from the audit log)
  - [x] P8-T3b Renewal rate, renewals due 30/60/90, revenue by plan and customer, concentration (shared with the health check)
- [x] P8-T4 Spending analytics + anomaly flag
- [x] P8-T5 Nightly metric_snapshots
- [x] P8-T6 Home as Role Center (split for size)
  - [x] P8-T6a Cue sets per role, every cue drills down, order headline → cues → charts → lists → shortcuts
  - [x] P8-T6b Personalisation: reorder and hide cues, saved per person
- [x] P8-T7 Money in & out as analytical list page (bulk actions come with P9-T4)
- [ ] P8-T8 Customers and Invoices as analytical lists; Customer and Invoice object pages
- [ ] P8-T9 Business health v2

## Phase 9 — Reports and actions
- [ ] P9-T1 Report framework
- [ ] P9-T2 The 8 reports [REVIEW]
- [ ] P9-T3 Customer statement + send
- [ ] P9-T4 Bulk actions wired [REVIEW]
- [ ] P9-T5 Notifications centre + badge
- [ ] P9-T6 Period comparison toggle
- [ ] P9-T7 Performance pass
- [ ] P9-T8 Accessibility pass

## v2 acceptance
- [ ] Every number on Home opens the list that produced it
- [ ] Lists have filters, saved views, bulk actions, and export
- [ ] Aging, DSO, CEI, MRR tested against a hand-calculated fixed dataset
- [ ] Home loads under 1.5s with 50k transactions
- [ ] A non-finance person can still read Home's top layer without jargon
- [ ] No screen is only text: each has numbers, status, or a chart carrying the meaning

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
- 2026-10-03 · P6-T1 · /settings/audit-log "Change history" (owner): filter by who / what / dates, "All changes to this" narrows to one record; every change in plain words (src/lib/audit-describe.ts) — a DB test fails if any audited table or column has no words; fixed: audit rows for health limits had no record id (the table is keyed by signal) — the trigger now uses the primary key; older health-limit rows stay unnamed (log is insert-only); 315 unit/DB + 47 e2e pass · next: P6-T2
- 2026-10-03 · P6-T2 · /settings/team (owner): add someone (name, email, role) → copyable sign-in link → they choose a password + set up 2FA; change role, switch off / back on, new link for people who haven't joined (never for someone with 2FA set up — no account takeover); 5 DB tests (immediate access loss, audited role change with actor, owner-only, never delete, last owner incl. self) + e2e invite → join → link reuse refused → switch off → signed out; e2e removes its invitee afterwards; 320 unit/DB + 49 e2e pass · next: P6-T3 [REVIEW]
- 2026-10-04 · P6-T3a · CSP with per-page nonce + HSTS/frame/nosniff headers (e2e on the production build, no CSP violations); rls-coverage test (tables without RLS, definer views, anything anon can read/run, writable views) — it found anon grants on 7 views and 21 functions, removed; secrets test (admin client server-only, no NEXT_PUBLIC_ secrets); CI: pnpm audit --prod + gitleaks over full history; audit found a critical Next.js advisory → 16.3.5 → 16.3.6 · next: T3b
- 2026-10-04 · P6-T3b · login: 20 failed per IP / 10 per email per 15 min (database counters, failures only); invite links 10 failed per IP; new-device sign-ins recorded by the proxy (insert-only) and shown to the owner on Home; 2FA codes rate-limited by Supabase per browser IP · next: T3c
- 2026-10-04 · P6-T3c · customer phone/email for owner + operator only (column rights + customer_contacts(); team lists and customer page/PDF use it); change history except labels/subscriptions owner-only; docs/security.md: checklist with how each item is tested, local restore drill (counts, money total, RLS/policies/triggers identical), UU PDP retention table with 3 owner decisions; 336 unit/DB + 54 e2e pass · ⏸ STOPPED for human review of P6-T3
- 2026-10-05 · P6-T3 · code approved by human · next: P6-T4
- 2026-10-05 · P6-T4 · /setup (owner): 7 steps, most tick themselves off from the data (bank account, transactions, labels, active subscription, regular cost, 2+ team members), each can be marked done/skipped (setup_steps, saved → resumes at the first open step); "Getting started" card on owner Home until done; added the missing "Add a customer" form (owner/operator; WhatsApp typed the local way → +62…); 345 unit/DB + 57 e2e pass · waiting on the non-tech tester (human), then P6-T5
- 2026-10-05 · P6-T5 · e2e critical flow (sign in → label → bill → payment matched by import → bill paid, its reminder "Not sent · The bill was paid", thank-you due; every pending reminder cancelled in the records); contrast test over the design tokens (WCAG AA, incl. see-through backgrounds) — fixed 2 failures (balance-banner detail, input placeholders); one focus ring for every control, Skip to content link; loading / error ("This page didn't load… nothing you saved was lost") / not-found screens; Home, Health and Weekly summary now refuse to show numbers from a failed read (they showed Rp 0 / "No data yet"); sweep over all 17 screens on desktop + phone: one h1, labelled fields, no console errors, no sideways scroll; reduced motion was already global. No canvas file to compare screens against (same as P4); 364 unit/DB + 60 e2e pass (twice) · next: P6-T6 [REVIEW] — mostly the human's (production keys, real bank)
- 2026-10-05 · P6-T6 · Settings → Parallel run (owner): each Monday the owner writes their 4 numbers (came in / went out last week, cash + still owed now); record_parallel_week() stores the app's own numbers at that moment (nobody can type them), audited; differences to the rupiah; "ready for go-live" after 2 back-to-back matching weeks (unit + DB + e2e tests); /dev/components hidden in production; docs/launch.md: production Supabase + Vercel step by step (first owner by hand, env table, no seed, no mocks), view-only bank user + CSV import until P1-T4, sending stays manual, 15-min smoke test, parallel run, go-live sign-off, rollback; 369 unit/DB + 62 e2e pass · ⏸ STOPPED for human review
- 2026-10-08 · 2FA switch (owner request, see Decisions) + fixed invoicing job crash on past renewal days · UPGRADE-v2-erp-ux.md read; Phases 7–9 added below Phase 6
- 2026-10-08 · P7-T1 · density tokens (h-row 40px, text-table 13px); Table/Th/Td/Tr (sticky header, right-aligned amounts), Money (sign + colour: in green +, out rust −; digits lined up, separators kept narrow — the body font widens them in tabular mode), Skeleton (used by the loading screen); one health status → colour/order map (lib/health-status.ts) replacing 3 copies, statuses always from the DB thresholds; /dev/components shows all; 374 unit/DB + 63 e2e pass · next: P7-T2
- 2026-10-08 · Money in & out v2 (owner asked for it first): money_list() / money_list_summary() — one SQL definition of the filters that the list, totals, charts and CSV all read (Jakarta days, own transfers listed but out of totals, reader's RLS); filter bar with removable chips (old ?show= links still work); totals that drill down; in/out-by-month and biggest-categories charts (plain CSS, every bar a link that filters); dense table with date/amount sorting, account column on wide screens, description truncates so amounts stay visible; CSV export (formula-injection guard, UTF-8 BOM, same sort). Also: e2e removes its test sign-in records afterwards (432 cleared locally). 385 unit/DB + 64 e2e pass · next: P7-T3 saved views [REVIEW] (finishes P7-T2)
- 2026-10-08 · P7-T3 + P7-T2 · saved_views (own views private; the owner sets one starting view per list and role; only plain filter characters stored — checked by the app, which rebuilds the query from the checked filters, and by a DB check; no audit: not money data); Views row under the filter bar (Everything, one click per view, × to remove, + Save this view; owner can make it the starting view for a role); bare /money opens your role's starting view, "Everything"/Clear all is ?all=1 so it never bounces back; 4 RLS tests + e2e; money e2e now waits for streamed rows; 390 unit/DB + 65 e2e pass · ⏸ STOPPED for human review of P7-T3
- 2026-10-08 · P7-T3 approved by human
- 2026-10-08 · P7-T4 · <DataTable> (src/components/data-table.tsx): only on-screen rows in the page (+10 each side), sticky header, sorting (server links, or in the browser for lists held whole), Columns chooser (remembered per browser), tick boxes + action bar when a list has bulk actions (wired in P9-T4), totals row, CSV (server file, or what is shown); Money in & out uses it — 500 per page (was 50), totals row = difference of everything matching, Category hidden on phones so the amount always fits; /dev/data-table: 50,000 rows — e2e benchmark scrolls top to bottom jumping ~11,000px a frame: median 16.7ms (60fps), p95 18.2ms; plus sort, tick all, column off survives reload, CSV = 50,000 rows; 394 unit/DB + 69 e2e pass · next: P7-T5
- 2026-10-08 · Owner requests before P7-T5: Customers / Renewals filter tabs did nothing until "Show" was pressed — tabs are now links that apply at once and keep the search (FilterTabs); Business health made visual — score ring (how many checks healthy), a gauge per check coloured by the owner's limits with a pin at today's value (lib/health-gauge.ts, tested), trend line once there are 2+ days, worst first and "no data yet" last; corporate restyle (see Decisions). Fixed on the way: a bill just written could be missing from the customer page (20 shown, ties on due date in random order) — newest first now
- 2026-10-08 · P7-T5 · <Cue> (src/components/cue.tsx): label, number (wide = exact rupiah, normal = short or a count + unit), trend vs previous period (lib/trend.ts: bigint-exact %, green/rust by whether up is good, tested), status bar from the owner's limits, whole tile opens its filtered list (one spoken sentence for screen readers), sparkline on wide tiles, CueSkeleton for loading on its own; Home's "This month" is now 5 cues (came in / went out with 6-month lines, still owed coloured by the late-payment limit, need a label, paying late — the two counts load independently); /dev/components shows all variants; 410 unit/DB + 70 e2e pass · next: P7-T6
- 2026-10-08 · Owner request: importing a bank statement made hard to miss on Money in & out — blue "Import a bank statement" button at the top (owner/operator only; viewers don't see it), and an amber banner when a statement-fed account has had no import for 7 days (or never), saying what may be missing, with the button in it. Also: Home's "Reminders to send" says "Showing the 30 oldest of N" instead of cutting off silently; e2e runs now tidy up before and after (test users' open bills cancelled, found through the audit log; the E2E Flow thank-you closed) — leftovers had pushed tests' own bills off 20/8/30-item lists, which made 3 tests flaky; locally cleared 21 test reminders and the test users' open bills. 410 unit/DB + 71 e2e pass (twice) · next: P7-T6
- 2026-10-08 · Owner request: record money in/out by hand (/money/new; shortcut buttons on Home's banner and Money in & out's header; owner/operator only), with who + what-for details. Details editable on every transaction, right after an import ("Add details" for the imported rows), shown in the list (one line, "By hand" tag), searched, in the CSV and in the change history. Hand entries can be cancelled; the import check warns about likely doubles. The statement file box is now a dashed drop area with a blue choose-file button. Fixed along the way: own-transfer detection now names its category (there are two in the transfer group now). e2e tidy removes the test users' hand entries; the daily balance check ignores hand entries (they aren't the bank's). 415 unit/DB + 72 e2e pass · next: P7-T6
- 2026-10-08 · Owner request: one "Add money in or out" button on Money in & out opens one page with two tabs — "Type it in" (/money/new) and "Import a bank statement" (/money/import); the 7-day import banner keeps its own import button. Home's add-money buttons are big: green "Money in", red "Money out" (contrast tested). 416 unit/DB + affected e2e pass · next: P7-T6
- 2026-10-09 · P7-T6 done: <AnalyticalListPage> (title + actions → notices → filters → totals → chart strip → table) and <SidePanel>. The open row lives in the address (?open=<id>, panelHref()): beside the list on xl screens (the app frame widens to 7xl while a panel is open), sliding over a dimmed list below that, full-screen on phones. Esc or × closes; the list keeps its scroll position; the open row is marked (DataTable activeKey); focus moves into the panel. Demo with made-up data at /dev/analytical-list; e2e/list-page.spec.ts (desktop + phone). Money in & out moves onto it in P8-T7. 417 unit/DB pass; e2e 74 pass — the 2 failures are reminders-to-send and critical-flow, which fail only between 00:00 and 08:00 Jakarta (a new bill's message is due at 08:00), not related · next: P7-T7
- 2026-10-09 · Owner request: Business health gauges — the limit labels (20%, 35%) were positioned outside the layout and covered the sentence under the bar; they now sit on their own line, and the value tag lines up with the track's end near 0%/100% instead of hanging over the card's edge.
- 2026-10-09 · P7-T7 done: <ObjectPage> — header (date, title, the big number, status pills, actions) + key facts strip (auto-fit columns) + sections (each a titled card) + a sticky jump nav that marks the section being read (<SectionNav>, IntersectionObserver). mode="panel" drops the title (the side panel shows it) and the nav, lays facts two to a row, and prefixes section ids. The transaction page (/money/[id]) is built on it; the list demo's panel uses panel mode. e2e/object-page.spec.ts. e2e: the 'Change history' locators now use the section's role; the hand-entry test's statement row is labelled by the e2e tidy-up (an old needs-label row crowded the 5-oldest inbox); 5 such leftovers labelled locally. 417 unit/DB + 75 e2e pass; still failing only before 08:00 Jakarta: reminders-to-send and critical-flow's reminder step (task suggested) · next: P7-T8
- 2026-10-09 · P7-T8 done: charts.tsx gains BarChart (InOutBars now wraps it), LineChart, StackedBars, AgingBars, Donut — plain HTML/SVG, every mark a Link whose href is the filter, a full sentence per mark for screen readers, a hover/focus tooltip with the numbers, a legend for 2+ series. Category colours: 6 fixed slots in globals.css (checked with the dataviz validator: colour-blind safe; no red/green, which mean out/in), past 6 the smallest fold into "Other"; lateness is one hue lighter→darker. Arithmetic in lib/chart-math.ts (tested). Showcase /dev/charts; e2e/charts.spec.ts clicks each kind. 421 unit/DB + charts/money/list-page e2e pass · next: P7-T9
- 2026-10-09 · P7-T9 done: <CommandPalette> (native <dialog>; Ctrl/⌘ K or the "Find or jump to" button in the sidebar / phone header). Screens and common actions (lib/command-palette.ts, offered by role on the server, words matched from their start), plus global search as the person signed in (search-actions.ts, RLS applies): customers by name, bills by number (opens the customer page at that bill, #bill-<id>), transactions via money_list search (description, who, note); 5 each, newest first, stale answers dropped. Combobox + listbox, arrows/Enter/Esc. Bill status names moved to lib/invoice-status.ts. Named "Find…" so it never clashes with a page’s own Search field. e2e/command-palette.spec.ts. 424 unit/DB + 80 e2e pass · next: P7-T10
- 2026-10-09 · P7-T10 done: DataTable keys — j / k move focus row to row (the row's link; Enter opens it), scrolling to rows not drawn yet and never losing a held-down key; with the side panel open j / k open the next / previous row in it; when the panel closes and focus has nowhere to go, it returns to that row. "/" focuses the page's search box, or opens the find box (Ctrl K) where there is none. Shortcuts stay quiet while typing in a field or with a dialog open (lib/keys.ts). Key hint above the table on wide screens. e2e/keyboard.spec.ts. 424 unit/DB + 82 e2e pass · next: Phase 8 (P8-T1 [REVIEW])
- 2026-10-09 · P8-T1 · lib/metrics.ts: Metric shape + statusAgainst + cash metrics (§4.1): cash position, runway, net cashflow this month (vs last month to the same day), forecast low point, forecast accuracy (|in off| + |out off| ÷ expected in + out); lib/metrics-data.ts loads them as the person signed in. Migration 20261009000000_cash_metrics: money_summary balance as of p_today, money_list status "recurring" (filter "Regular cost" — runway opens the regular costs it divides by), forecast_low / forecast_off limits (on Settings → Health limits). Not yet: forecast low trend and forecast accuracy values need history (P8-T5 snapshots); cash position opens /settings/bank, which doesn't list balances yet. 438 unit/DB pass, typecheck clean · ⏸ STOPPED for human review of P8-T1
- 2026-10-09 · P8-T1 approved by human
- 2026-10-09 · P8-T2 · migration 20261009000100_receivables: invoices.voided_at (+ trigger, backfill, check), invoice_owed_on(day), aging_bucket(), receivables_summary(day) (aging, DSO/CEI inputs, migration), top_overdue(day) (with last reminder sent), limits overdue_share 10/15 %, over_90_share 20/25 %, dso 45/60 days, cei 85/75 % (on Settings → Health limits). lib/metrics.ts: outstanding (trend uncoloured), aging, overdueShare, over90Share, dso, cei, bucketMigration; loadReceivableMetrics. Fixed dataset (7 bills, hand-worked) checked SQL + formulas end to end; local data: total and past due equal Home's. Links open /customers(?show=late) until the bill list (P8-T8). 443 unit/DB pass, typecheck clean · ⏸ STOPPED for human review of P8-T2
- 2026-10-09 · P8-T2 approved by human
- 2026-10-09 · P8-T3 · migrations 20261009000200_subscription_revenue (subscription_state_on, yearly_value, mrr_summary) and 20261009000300_renewals_revenue (renewal_counts as of a day, revenue_by_customer, revenue_by_plan, take_health_snapshot steps 4–5 call them, renewal_pipeline 90 days). lib/metrics.ts: mrr, arr, mrrMovement (added − lost), renewalRate, renewalsDue (30/60/90, risky = any pipeline flag), ranked, concentration; loadRevenueMetrics. Renewals screen gains "Next 90 days". Health-limit words for the 6 limits added in T1/T2 (change history showed raw names). Fixed datasets: 7 subscriptions with back-dated histories (MRR 11 jt vs 13 jt; added 3, lost 5) and 2 customers / 8 bills (renewal 2 of 4; Alpha 81.3%) — the health check gives the same values. 449 unit/DB pass, typecheck clean · ⏸ STOPPED for human review of P8-T3
- 2026-10-09 · P8-T3 approved by human
- 2026-10-09 · P8-T4 · migration 20261009000400_spending: spending_summary(day) (money out this month and the 3 full months before, by category × regular/one-off; active accounts, own transfers and cancelled hand entries out — like every total), top_payees(day) (this month; the typed "who" when there is one, else the bank's description — banks rarely send a clean name), limit spend_jump 30/60 % (Settings → Health limits). lib/metrics.ts: spendByCategory (vs the usual month = 3-month total ÷ 3, compared exactly; flagged at or past the owner's limit; this month so far vs a whole usual month, so the month's pace never flags), spendSplit (regular vs one-off); loadSpendingMetrics. Fixed dataset incl. a category exactly at 30%; local data: this month's total = Home's went out. 450 unit/DB pass, typecheck clean · next: P8-T5 nightly metric_snapshots
- 2026-10-09 · P8-T5 · migration 20261009000500_metric_snapshots (taken_on, metric, rupiah bigint | value numeric, never both; read by any role, written by the job only); lib/metric-snapshots.ts: snapshotRows (12 metrics + forecast_month_in/out on the month's first), takeMetricSnapshot, history, loadSnapshots; lib/metrics.ts: keptLow, keptForecast, monthEnd — forecast low now has its month-ago value and forecast accuracy scores last month once a month has a kept forecast (first possible: November, for October from the 10th). Ran the job twice against the local database: 14 rows, re-run overwrites (today's snapshot is kept — it is what the job would write). 459 unit/DB pass, typecheck clean · next: P8-T6 Home as Role Center
- 2026-10-09 · P8-T6 · Home as Role Center, split for size. T6a: lib/home-cues.ts lists 24 cues (money, customers, daily work), a starting set per role (owner: cash, forecast low, left over, runway, % past due, owed, MRR, renewal rate, biggest customer, costs above usual, marked paid by hand, balance mismatches; viewer: the same minus owner-only pages; operator: need a label, money in not matched, reminders to send, messages not delivered, paying late, mismatches, owed, came in / went out). A cue is never offered if it opens a page the role can't. Each cue is its own Suspense (cached loaders: one read per group), shows a trend vs a month ago and a status from the owner's limits, has a sparkline from metric_snapshots plus today's live value, and opens its list already filtered (the 2 count cues use the same money_list as the list they open). Page order: headline → cues → charts (in/out, who paid most, where money went) → lists (+ "Messages not delivered") → shortcuts. Cue shows "—" for not enough data, never 0. T6b: migration 20261009000600_home_layouts (one row per person, RLS own row only); "Arrange these numbers" on Home: move up/down, hide, show, back to the starting set; each click saves. Found in the browser: an upsert also updates user_id, which isn't granted, so it's left out (it defaults to the person signed in). 465 unit/DB + home/accessibility e2e pass, typecheck and lint clean · next: P8-T7 Money in & out as analytical list page
- 2026-10-09 · P8-T7 · Money in & out now uses <AnalyticalListPage> (title + actions → import reminder and needs-a-label inbox → filters + saved views → totals → 2 charts → table). A row opens in the side panel (?open=<id>) beside the list: the same transaction object page, in panel mode (money/[id]/transaction.tsx, transactionView(), shared with the full page), with "Open as a page". Labels, notes, matching and cancelling all work in the panel; the list keeps its scroll; the open row is marked; j / k step through rows in the panel; Esc closes and focus returns to the row. Changing a filter, sort or page closes the panel; an unknown or hidden id opens none. e2e detail and object-page specs now go through the panel. 465 unit/DB + 84 e2e pass (72 skipped: mostly desktop-only flows on phone), typecheck and lint clean · next: P8-T8 Customers and Invoices as analytical lists; Customer and Invoice object pages
