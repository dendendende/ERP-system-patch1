# Phase 0 — Project Setup

**Goal:** a running, tested, deployable empty app with auth, roles, and audit logging in place.
**Branch:** `phase-0-setup`
**Needs from human:** Supabase project (staging), Vercel project, GitHub repo.

---

### P0-T1 — Initialize project
- Next.js (App Router) + TypeScript strict + pnpm.
- ESLint + Prettier. Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`.
- `.env.example` with variable names only.
- **Done when:** `pnpm build` and `pnpm typecheck` pass.

### P0-T2 — Design tokens and base components
- Tailwind config with tokens: ground `#F4F1EA`, surface `#FFFFFF`, ink `#1C1B18`,
  muted `#5E5A52`, line `#E2DDD2`, in/green `#1E6B4F`, attention/amber `#B7791F` (text `#5C3D00`
  on `#F6E7C4`), problem/rust `#A8431F`.
- Fonts: Newsreader (display, headline numbers), Schibsted Grotesk (UI text). Tabular numbers utility.
- Components: Button, Card, Badge/StatusPill, Input, Checkbox, Table rows, EmptyState.
- `formatRupiah(amount: bigint)` helper + tests (e.g. `Rp 12.000.284`, short form `Rp 12 jt`, `Rp 2,65 M`).
- Transitions: 150–250ms ease-out. Respect `prefers-reduced-motion`.
- **Done when:** a `/dev/components` page shows every component; formatter tests pass.

### P0-T3 — Testing and CI
- Vitest for unit tests, Playwright for e2e (one smoke test: home page loads).
- GitHub Actions: lint, typecheck, unit tests on every push.
- **Done when:** CI is green on the branch.

### P0-T4 — Supabase and migrations
- Supabase CLI, local dev database, migrations folder, seed script with fake data.
- Typed database client (generated types).
- **Done when:** `supabase db reset` runs migrations + seed cleanly.

### P0-T5 — Auth, 2FA, roles **[REVIEW]**
- Supabase Auth email login + TOTP 2FA (required for all users).
- `users` profile table: `id`, `name`, `role` (`owner` | `operator` | `viewer`), `created_at`.
- RLS enabled; helper SQL function `current_role()`.
- Route protection middleware; session timeout.
- **Done when:** tests prove a viewer cannot write, an operator cannot access owner-only routes.

### P0-T6 — Audit log **[REVIEW]**
- `audit_log`: `id`, `actor_id`, `action`, `table_name`, `record_id`, `old_value jsonb`,
  `new_value jsonb`, `reason`, `created_at`.
- Insert-only (no UPDATE/DELETE privileges). Server helper `withAudit()` used by all money writes.
- **Done when:** test confirms rows cannot be updated or deleted, and helper writes correct diffs.

### P0-T7 — App shell
- Sidebar navigation: Home, Money in & out, Customers & billing, Business health, Settings.
- Sync status slot at the bottom of the sidebar (placeholder).
- Empty stub pages for each route.
- **Done when:** navigation works on desktop and phone widths; deploy to Vercel preview succeeds.

---

## Phase 0 acceptance
- [ ] CI green
- [ ] Login with 2FA works on preview deploy
- [ ] Roles enforced by RLS (tested)
- [ ] Audit log is insert-only (tested)
- [ ] Human reviewed P0-T5 and P0-T6
