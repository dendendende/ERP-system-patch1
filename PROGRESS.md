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
