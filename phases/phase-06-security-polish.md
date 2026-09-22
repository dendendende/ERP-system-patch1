# Phase 6 — Security, Audit UI, Setup Guide, Launch

**Goal:** safe to use with real money and understandable on day one.
**Branch:** `phase-6-launch`

---

### P6-T1 — Audit log screen (owner)
- Search by person, table, date, record. Show old vs new values in plain language
  ("Changed category from Other to Software").
- **Done when:** every audited action from Phases 1–5 displays readably.

### P6-T2 — Team and roles screen (owner)
- Invite by email, set role, deactivate user (never delete; history must remain).
- Owner cannot remove the last owner.
- **Done when:** role changes are audited and enforced immediately.

### P6-T3 — Security hardening **[REVIEW]**
- [ ] 2FA required for every user, no bypass
- [ ] Session timeout (e.g. 30 min idle) and new-device login alert to owner
- [ ] Rate limiting on login and all webhook endpoints
- [ ] Security headers (CSP, HSTS, frame-ancestors none)
- [ ] All tables have RLS; automated test lists any table without it and fails
- [ ] Secrets only in environment variables; `.env*` in `.gitignore`; secret scanning in CI
- [ ] Dependency audit in CI
- [ ] Database not publicly reachable except via Supabase API; service-role key server-side only
- [ ] Daily encrypted backups confirmed + one restore test performed
- [ ] Personal data (phone, email) access limited by role; data retention note for UU PDP
- **Done when:** every box ticked and human signs off.

### P6-T4 — First-time setup guide
- Step-by-step: connect bank → import/sync → label first transactions → add customers & subscriptions →
  confirm recurring expenses → set reminder schedule → invite team. Progress saved; can resume.
- Target: done in under 30 minutes by a non-tech person.
- **Done when:** a non-tech tester completes it without help (human test).

### P6-T5 — Polish and accessibility
- Compare every screen to the canvas; fix spacing, type, transitions.
- Keyboard navigation, focus states, contrast ≥ 4.5:1, `prefers-reduced-motion`.
- Empty, loading, and error states on every screen (plain language).
- **Done when:** Playwright e2e covers: login → label → invoice → payment matched → reminder cancelled.

### P6-T6 — Production launch **[REVIEW]**
- Production Supabase + Vercel environments, separate keys.
- Connect real bank using the **view-only** bank user (human does this, not Claude Code).
- Switch WhatsApp and email to live (human enters keys).
- Run 2 weeks in parallel with the current way of tracking money; compare numbers weekly.
- **Done when:** two consecutive weeks match; owner approves go-live.

---

## Phase 6 acceptance
- [ ] Security checklist fully ticked and signed off
- [ ] Setup guide tested by a non-tech person
- [ ] Two weeks of parallel run with matching numbers
