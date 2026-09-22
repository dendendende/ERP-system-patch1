# Phase 4 — Home, Balance Check, Business Health

**Goal:** a non-finance owner opens the app and understands the business in 10 seconds.
**Branch:** `phase-4-home-health`

---

### P4-T1 — Reporting queries
- Server functions (tested): cash in bank (sum of latest balances), came in this month, went out this month,
  still owed, past due, average monthly spending (last 3 months, **recurring only**), comparison to usual month.
- Exclude transfers between own accounts. One-off large expenses excluded from runway averages.
- **Done when:** results match hand-calculated values on a fixed seed dataset.

### P4-T2 — Daily balance check
- `balance_checks`: `id`, `bank_account_id`, `checked_on`, `expected bigint`, `actual bigint`,
  `difference bigint`, `status` (`ok` | `mismatch` | `no_data`), `likely_cause`.
- Daily job compares app-calculated balance vs bank-reported balance. Likely causes: missing days of sync,
  duplicate-looking rows, unmatched manual edits.
- Mismatch → red banner on Home for owner, plus owner notification.
- **Done when:** injected missing transaction in tests produces a mismatch with correct cause.

### P4-T3 — Health signals **[REVIEW]**
- `health_thresholds`: `signal`, `healthy_limit`, `warning_limit`, `direction` (`higher_is_better` | `lower_is_better`).
- `health_snapshots`: `date`, `signal`, `value`, `status`, `explanation`.
- Signals and defaults:
  1. Cash runway (months): healthy > 12, warning 6–12, danger < 6
  2. Net cashflow, 3-month average: healthy > 0, warning ≈ 0 or slightly negative, danger negative 3 months running
  3. Late > 30 days as % of amount owed: healthy < 10%, warning 10–25%, danger > 25%
  4. Renewal rate, last 12 months: healthy > 90%, warning 80–90%, danger < 80%
  5. Biggest customer share of revenue: healthy < 20%, warning 20–35%, danger > 35%
- Overall status = worst signal. Each snapshot stores a plain-language explanation sentence.
- **Done when:** boundary tests for every threshold pass.

### P4-T4 — Home screen
- Headline sentence with cash and runway; status pill linking to Business health.
- Three totals: Came in, Went out, Still owed (with past due link).
- Money in vs out bar chart, last 6 months, plus one plain sentence summarising the trend.
- Today list: auto-matched payments, reminders sent, items needing a label, escalations, balance mismatch.
- **Done when:** matches the "Home" canvas screen; loads under 1.5s on staging.

### P4-T5 — Business health screen
- Five checks as questions ("How long the cash lasts", "Getting paid on time", …); worst ones first,
  each with value, safe limit, explanation, and a next-step button where relevant.
- **Done when:** matches the "Business health" canvas screen.

### P4-T6 — Health limits settings (owner)
- Edit thresholds with plain explanation of each. Changes audited.
- **Done when:** changing a limit updates the next snapshot, not past snapshots.

---

## Phase 4 acceptance
- [ ] Report numbers match hand-calculated seed values (tested)
- [ ] Balance mismatch detection works (tested)
- [ ] Health boundaries correct (tested)
- [ ] Human reviewed P4-T3 and checked screens against the canvas
