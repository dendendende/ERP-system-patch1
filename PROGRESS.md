# PROGRESS

**Current phase:** 1
**Current branch:** phase-1-bank-data (branched from phase-0-setup)
**Last updated:** 2026-09-19

## How to use
- Tick a task only after its tests pass and it is committed.
- Add a short note after each ticked task: what was done, anything the next session must know.
- `[REVIEW]` tasks: tick only after the human confirms. Until then mark as `⏸ awaiting review`.
- If interrupted mid-task, the next session starts by running `git status` and resuming that task.

## Blockers
- P0-T3 / P0-T7 / Phase 0 acceptance: "CI green", "deploy to Vercel preview" and "login with 2FA on preview" need the human: push the branch, and provide the staging Supabase project + Vercel project (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SESSION_TIMEOUT_MINUTES in Vercel). Local equivalents all pass.

## Decisions log
- 2026-09-18 · Next.js 16 scaffold: `typecheck` runs `next typegen` first (route types like `LayoutProps` are generated). Next 16 renamed `middleware` → `proxy`.
- 2026-09-18 · Vitest installed in P0-T1 so `pnpm test` works from the first task; P0-T3 adds Playwright + CI.
- 2026-09-18 · Role helper is `current_app_role()` (not `current_role()`: CURRENT_ROLE is a reserved SQL keyword). It returns NULL unless the JWT is aal2, so RLS itself enforces 2FA.
- 2026-09-18 · Session timeout is app-side (proxy `last_active` cookie, SESSION_TIMEOUT_MINUTES, default 30) — works on every Supabase plan.
- 2026-09-18 · Public sign-up disabled; the owner adds people (P6-T2). `[auth.email] enable_signup` must stay true or email login is disabled entirely.
- 2026-09-19 · `withAudit()` is implemented in the database, not app code: `select enable_audit('table')` attaches a trigger that writes audit rows in the same transaction; the reason is passed with `set_config('app.audit_reason', ..., true)` inside the RPC doing the write. Every money table must call enable_audit in its migration.

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
- [ ] P1-T1 Bank tables [REVIEW] — ⏸ awaiting review
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
