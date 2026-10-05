# Security notes (P6-T3)

What protects the money data, how each item is checked, and what a person still has to do
before launch. "Test" means it runs in `pnpm test` / `pnpm test:e2e` and fails if it breaks.

## Checklist

| Item | Status | How it is enforced / checked |
|---|---|---|
| 2FA for every user, no bypass | ✅ | Every RLS policy uses `current_app_role()`, which is empty unless the session passed 2FA (aal2). The proxy sends anyone without 2FA to set it up / enter the code. Tests: `roles.test.ts`, e2e sign-in always enrols TOTP. |
| Session timeout | ✅ | 30 min idle (`SESSION_TIMEOUT_MINUTES`), proxy. Test: `routes.test.ts`. |
| New-device sign-in alert to owner | ✅ | First page after 2FA in a browser the app hasn't seen that person use → `sign_in_devices` row (insert-only). Owner sees "Signed in from a new device" on Home (last 7 days). Shown in the app, not sent — sending is on hold app-wide. Tests: `rate-limits-devices.test.ts`, e2e `security-headers.spec.ts`. |
| Rate limiting: login | ✅ | 20 failed passwords per IP and 10 per email every 15 min, counted in the database (`rate_limits`) because serverless instances share no memory and Supabase's own limit only sees the server's IP. Only failures count. 2FA codes are checked by Supabase directly from the browser, so its per-IP limit (`token_verifications`) applies. Invite links: 10 failed per IP / 15 min. Tests: `rate-limits-devices.test.ts`, e2e lockout. |
| Rate limiting: webhooks | ✅ n/a | There are no webhook endpoints yet (delivery webhooks, P3-T6, are on hold with sending). Cron routes need `CRON_SECRET` (constant-time compare). When a webhook is added: verify its signature first, then use `rateLimit()` from `src/lib/rate-limit.ts`. |
| Security headers | ✅ | CSP with a fresh nonce per page and `frame-ancestors 'none'` (proxy); HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy (next.config.ts); no `X-Powered-By`. Test: e2e `security-headers.spec.ts` (production build, also checks the CSP blocks nothing the app uses). |
| Every table has RLS | ✅ | Test `rls-coverage.test.ts` lists by name any table without RLS, any view not running with the reader's rights, anything signed-out visitors can read or run, and any writable view. |
| Secrets only in env vars; `.env*` ignored; secret scanning in CI | ✅ | `.gitignore` has `.env*` (`.env.example` holds names only). CI job `secrets` runs gitleaks over the whole history (`.gitleaks.toml`). Test `secrets.test.ts`: no `NEXT_PUBLIC_` secret names. Note: the local branch `backup-before-squash` (never pushed) has a commit with `.env.local` — it holds only Supabase's public local-demo keys; delete the branch when it's no longer needed. |
| Dependency audit in CI | ✅ | `pnpm audit --prod --audit-level high` in CI. It found a critical Next.js advisory (GHSA-vcvr-r3jv-pc5j); upgraded 16.3.5 → 16.3.6. Dev-only tools are left out: `braces` (via eslint) has no fix yet and never ships. |
| Database only via Supabase API; service-role key server-side | ⚠️ human for production | Code: `src/lib/supabase/admin.ts` is `server-only` (build fails if a browser bundle imports it); test `secrets.test.ts`. Production: in Supabase → Database → Network restrictions, allow no direct IPs (the app only uses the HTTPS API); keep "Enforce SSL" on; put `SUPABASE_SERVICE_ROLE_KEY` in Vercel as a server-only (non-`NEXT_PUBLIC_`) variable. |
| Daily encrypted backups + one restore test | ⚠️ human for production | Supabase Pro takes daily backups, encrypted at rest (AES-256); turn on Point-in-Time Recovery if the plan allows. **Restore drill done locally 2026-10-04**: `pg_dump` → restored into an empty database → row counts for bank transactions, entries, bills, payments, audit log, customers, team all equal; bank total equal; RLS tables (20), policies (43), triggers (27) equal; nothing granted to signed-out visitors. Before go-live: restore one production backup into a separate Supabase project (Dashboard → Database → Backups → Restore to new project) and compare the same numbers. |
| Personal data limited by role; UU PDP note | ✅ (+ owner decisions below) | Customer phone + email: owner and operator only (database column rights + `customer_contacts()`); viewers see customers and bills without contact details. Team emails: owner only (Team screen). Change history holding contact details: owner only. Test: `personal-data.test.ts`. |

## Personal data and retention (UU PDP, UU 27/2022)

What the app holds about people, why, who can see it, and how long it stays.

| Data | Why | Who sees it | Kept |
|---|---|---|---|
| Customer name, WhatsApp number, billing email | Sending bills and reminders | Owner, operator (name: whole team) | While they are a customer. **Owner decision:** clear contact details when a customer has ended and nothing is owed (no screen for this yet). |
| Bills, payments, bank transactions (payer names in descriptions) | Bookkeeping | Whole team | 10 years — Indonesian record-keeping rules for company financial records (UU 8/1997, UU KUP). Bank rows can't be edited or deleted by design. |
| Team member name, email, role | Sign-in, accountability | Owner (emails), team (names) | Never deleted: switched off, so history keeps a name. |
| Change history (`audit_log`) | Who changed money data, when | Owner (labels/subscriptions: team) | Kept for good (insert-only). It can contain a customer's old contact details. **Owner/legal decision:** whether a deletion request should remove those from history. |
| Sign-in devices (browser, IP address) | Spotting sign-ins that weren't the team | Owner | **Owner decision:** suggested 1 year. |
| Failed sign-in counters (email, IP) | Stopping password guessing | Nobody (server only) | 1 day, cleared automatically. |

Data stays in the Supabase Singapore region. Development uses only made-up data.

## Sign-off

- [ ] Human review of P6-T3 (this file + the changes)
- [ ] Production: network restrictions + SSL enforced, service-role key server-only in Vercel
- [ ] Production: backups on, one restore into a separate project compared
- [ ] Owner decisions above (contact clean-up, history, device retention)
