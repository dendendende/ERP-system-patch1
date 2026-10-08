# Launch runbook (P6-T6)

Step by step from "works on my computer" to "the business relies on it". Every step here is done
by a person (the owner or whoever runs the accounts) — the app's code never touches production
keys, the real bank login, or live sending. Tick each box as you go.

Security setup that belongs to launch is in [security.md](security.md) (Sign-off) — do both.

## 1. Production database (Supabase)

- [ ] Create a **new** Supabase project, region **Southeast Asia (Singapore)**, on a paid plan
      (daily backups; hourly bank sync needs Vercel Pro anyway, see step 2). Never reuse the
      staging project: production gets its own keys.
- [ ] Authentication → Sign In / Providers: Email on, **"Allow new users to sign up" off**.
- [ ] Authentication → Multi-Factor: **TOTP on**. The app's own switch (Settings → Team → 2-step sign-in) starts ON in a new database; keep it on for go-live.
- [ ] Authentication → URL Configuration: Site URL = the production address
      (e.g. `https://cashflow.yourcompany.co.id`).
- [ ] Authentication → Sign In / Providers → Email → "Email OTP Expiration". Invite links are sent by hand, so 24 hours
      (86400 s) is friendlier than the 1-hour default.
- [ ] Database → Network restrictions: allow no direct IPs. Settings → Database: enforce SSL.
- [ ] Database → Backups: daily backups on; Point-in-Time Recovery if the plan allows.
- [ ] Put the database schema in, from this repository (never the seed — it is fake demo data):

  ```bash
  pnpm exec supabase link --project-ref <production-project-ref>
  ```
  ```bash
  pnpm exec supabase db push
  ```

- [ ] First owner (sign-up is off, so the first person is added by hand):
  1. Authentication → Users → Add user → email + a strong password, "Auto confirm" on.
  2. SQL editor:
     ```sql
     update public.users
        set role = 'owner', name = 'Their Name'
      where id = (select id from auth.users where email = 'owner@yourcompany.co.id');
     ```
  3. They sign in and set up 2-step sign-in. Everyone else is added from **Settings → Team**.

## 2. Hosting (Vercel)

- [ ] Vercel project on **Pro** (the bank sync runs every hour; Hobby only allows daily jobs).
- [ ] Environment variables, set for **Production only** (Preview points at staging):

  | Name | Value |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | production project URL |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon / publishable key |
  | `SUPABASE_SERVICE_ROLE_KEY` | production service-role key — **server only**, never a `NEXT_PUBLIC_` name |
  | `CRON_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
  | `SESSION_TIMEOUT_MINUTES` | `30` |
  | `COMPANY_NAME`, `COMPANY_BANK_NAME`, `COMPANY_ACCOUNT_NUMBER`, `COMPANY_ACCOUNT_HOLDER` | the one account customers pay into — check it twice; every reminder prints it |
  | `SYNC_STALE_HOURS` | `6` (or leave empty) |
  | `FORECAST_ROLES` | leave empty (owner + viewer) unless you decided otherwise |
  | `BANK_ADAPTER` | **leave empty** until the real bank connection exists (P1-T4); statements are imported meanwhile |
  | `REMINDER_CHANNELS`, `REMINDER_AUTO_SEND`, `EMAIL_FROM` | **leave empty** — sending is by hand (see step 4) |

  Never set `BANK_ADAPTER=mock` or `REMINDER_CHANNELS=mock` here: the app refuses to run them in
  production. `SUPABASE_DB_URL` and `MAILPIT_URL` are for local development only.
- [ ] Deploy `main`. Domain + HTTPS in Vercel → Domains.

## 3. Real bank data

- [ ] In internet banking, create a **view-only** user for the app (can see transactions, can't
      transfer). A person does this; nobody gives bank passwords to developers or to Claude.
- [ ] Until the bank connection is built (P1-T4, waiting on the aggregator + sandbox key):
      **Money in & out → Import a bank statement** with the template CSV, at least once a day
      during the parallel run. Settings → Bank connections shows when data was last updated.
- [ ] Once the aggregator is chosen: connect it with the view-only user, set `BANK_ADAPTER`.

## 4. Sending to customers

On hold by the owner's decision: reminders appear on Home ("Reminders to send") and a person
sends them. WhatsApp (P3-T5) is deferred; email (P3-T4b) needs a provider + test key first.
When that changes: provider keys in Vercel, `REMINDER_CHANNELS`, `REMINDER_AUTO_SEND=on`, add
the `send-reminders` cron back to `vercel.json`, and build the delivery webhooks (P3-T6).

## 5. Check it works (15 minutes, right after the first deploy)

- [ ] Sign in as the owner: password, then the 6-digit code. A second browser shows up on Home
      under "Signed in from a new device".
- [ ] Getting started (Settings → Getting started) — work through it: bank account, first
      statement, labels, customers + subscriptions, regular costs, reminder timing, team.
- [ ] Import the same statement twice: the second time adds nothing.
- [ ] Write a bill for a real customer, check the transfer amount and the company account in the
      message preview (Home → Reminders to send → Copy).
- [ ] Settings → Change history shows what you just did, with your name.
- [ ] Vercel → Cron Jobs: `bank-sync` and `auto-invoice` ran without errors.

## 6. Two weeks in parallel

Keep tracking money the old way for two weeks. **Every Monday**, the owner opens
**Settings → Parallel run** and writes down, from the old way: what came in and went out last
week (Mon–Sun), cash in the bank right now, and what customers still owe right now. The app
stores its own numbers next to them at that moment.

- A difference? Find the transfer one side has and the other doesn't (Money in & out lists every
  transfer the app knows; check the statement was imported up to Sunday; money moved between
  your own accounts is left out on purpose). Fix the cause — a missing statement, a payment
  matched to the wrong bill — then write the week down again.
- **Done when two weeks in a row match to the rupiah.** The page then says so.

## 7. Go-live sign-off

- [ ] Security sign-off done ([security.md](security.md)), including **2-step sign-in switched ON** (Settings → Team)
- [ ] Setup guide tested by a non-technical person (P6-T4)
- [ ] Two consecutive matching weeks on Settings → Parallel run
- [ ] **Owner approves go-live** — date and name: ____________________

## If something goes wrong

- **A bad deploy:** Vercel → Deployments → the previous one → "Instant Rollback". Nothing in the
  database changes.
- **Wrong data:** the database is never edited by hand. Bank rows can't be changed; labels,
  bills and payments are corrected in the app, and Change history keeps the before and after.
- **Lost data:** restore a backup into a **new** Supabase project first, compare, then switch
  `NEXT_PUBLIC_SUPABASE_URL` and the keys over (security.md has the restore drill).
- **Someone shouldn't have access:** Settings → Team → Switch off. It works on their next click.
