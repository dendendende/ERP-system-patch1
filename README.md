# Cashflow App — Build Setup

This folder is the complete plan, split so Claude Code can build it **one small step at a time**.
If a session stops (token limit, crash, closed laptop), nothing is lost: progress lives in
`PROGRESS.md` and in git commits, not in the chat.

## Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Permanent rules. Claude Code reads it automatically every session. |
| `PROGRESS.md` | The single source of "where are we". Updated after every task. |
| `phases/phase-00-setup.md` | Project skeleton, database, auth, CI |
| `phases/phase-01-bank-data.md` | Bank connections, transactions, categories, rules |
| `phases/phase-02-customers-billing.md` | Customers, subscriptions, invoices, payment matching |
| `phases/phase-03-reminders.md` | WhatsApp + email reminder engine |
| `phases/phase-04-home-health.md` | Home dashboard, balance check, business health |
| `phases/phase-05-forecast-pipeline.md` | Cash forecast, renewal pipeline, weekly summary |
| `phases/phase-06-security-polish.md` | Audit log UI, security hardening, setup guide, polish |

## Setup (do once)

1. Create an empty git repository.
2. Copy `CLAUDE.md` and `PROGRESS.md` to the repo root, and the `phases/` folder too.
3. Commit: `git commit -m "chore: add build plan"`.
4. Open Claude Code in the repo.

## How to run each session

Paste this prompt at the start of **every** session:

```
Read CLAUDE.md and PROGRESS.md. Open the phase file for the current phase.
Continue from the first unchecked task. Do ONE task at a time:
implement it, run its tests, commit, then tick it in PROGRESS.md and commit again.
Stop and ask me before any task marked [REVIEW].
```

That's it. If a session dies mid-task, the next session sees the unfinished task in
`PROGRESS.md`, checks `git status`, and either finishes or resets that one task.

## Rules for you (the human)

- **One phase per branch.** Merge only when the phase's acceptance checklist passes.
- **Read every task marked `[REVIEW]`** before it merges: money math, migrations, roles, security.
- **Never give Claude Code** production database access, real bank credentials, or live WhatsApp keys.
  It works against staging with fake data only.
- **Start outside applications early** (they take days or weeks and block phases 1 and 3):
  - Bank aggregator account (sandbox + a view-only bank user)
  - WhatsApp Business API provider + template approval
