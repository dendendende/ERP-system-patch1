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


