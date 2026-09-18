# CLAUDE.md — Cashflow App

You are building a cashflow and billing web app for a business that sells software subscriptions
to its own customers. It handles large amounts of money. Correctness beats speed, always.

## Working protocol (follow every session)

1. Read this file, then `PROGRESS.md`, then the current phase file in `phases/`.
2. Run `git status`. If there are uncommitted changes from an interrupted task, either finish
   that task or discard it (`git restore .`) — never mix two tasks in one commit.
3. Work on **exactly one task** (the first unchecked one).
4. Implement → run tests (`pnpm test` and `pnpm typecheck`) → commit with a conventional message
   (`feat:`, `fix:`, `test:`, `chore:`), referencing the task id, e.g. `feat(P1-T3): ...`.
5. Tick the task in `PROGRESS.md`, add a one-line note, commit `chore: progress P1-T3`.
6. If a task is marked **[REVIEW]**: implement it on the branch, then STOP and tell the human
   what to review. Do not start the next task until they confirm.
7. Keep tasks small. If a task is growing beyond ~300 lines of change, split it: add sub-tasks
   (P1-T3a, P1-T3b) to the phase file and `PROGRESS.md`, commit, then continue.
8. If blocked (missing API key, unclear requirement), write the blocker in `PROGRESS.md` under
   "Blockers", commit, and stop. Do not guess.

## Product principles

- Users are **non-technical and non-finance**. Plain language everywhere. No accounting jargon
  on primary screens ("Came in", "Went out", "Still owed", not "Receivables", "Debit").
- Automation first: money data comes from the bank, not from typing.
- The app **reads** bank data. It never initiates transfers. Ever.
- UI must be calm and smooth: short eased transitions (150–250ms), no bouncy animation,
  tabular numbers for all money, no generic template look.

## Tech stack (do not change without asking)

- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS + own small component set; Motion for transitions
- Supabase: Postgres, Auth (with 2FA), Row Level Security, Singapore region
- Background jobs: Supabase cron or Trigger.dev
- Hosting: Vercel
- Tests: Vitest (unit), Playwright (critical flows)
- Package manager: pnpm

## Money rules (NON-NEGOTIABLE)

1. **Rupiah is stored as integers** (`bigint`). Never `float`, `real`, or JS decimals for money.
   Format only at display time.
2. **`bank_transactions` rows are immutable.** No UPDATE, no DELETE — enforce with DB privileges
   and RLS. Corrections happen in `entries`.
3. **`bank_transactions.external_id` is UNIQUE** per bank account. Re-syncs must be idempotent.
4. **Payments are separate from invoices.** One transfer can pay many invoices; one invoice can
   receive many payments. Invoice status is derived from the sum of payments.
5. **Unique amounts never collide** among open invoices (enforce with a constraint or locked check).
6. **All dates use Asia/Jakarta** for business logic ("due today", schedules). Store timestamps
   as `timestamptz`.
7. Every change to money-related data writes a row to `audit_log` (who, what, when, old, new).
8. Manual "mark as paid" is **owner-only**, requires a reason, and is audited.

## Security rules

- Never commit secrets. Use environment variables; keep `.env.example` updated with names only.
- Never use real bank credentials, production data, or live WhatsApp/email keys in development.
- All tables have RLS enabled. Roles: `owner`, `operator`, `viewer`.
- Reminder templates keep the company account number **fixed in config**, not editable per message.
- Validate every webhook signature. Rate-limit auth and public endpoints.

## Data model summary

Access: `users`, `audit_log`
Bank: `bank_accounts`, `bank_transactions`, `balance_checks`
Classification: `categories`, `rules`, `entries`
Billing: `customers`, `subscriptions`, `invoices`, `payments`, `reminders`
Forecast & health: `recurring_expenses`, `health_thresholds`, `health_snapshots`

Full field lists live in the phase files where each table is created.

## Out of scope for v1

Tax / Coretax, payment gateway, native mobile app, multi-currency, budgets, AI chat assistant.
Do not add these. Keep `entries` clean so a ledger and tax can be added later.
