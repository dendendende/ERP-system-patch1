# Phase 1 — Bank Data, Categories, Rules

**Goal:** bank transactions flow in automatically (or via CSV), and most get labelled by rules.
Everything later depends on this data being correct.
**Branch:** `phase-1-bank-data`
**Needs from human:** aggregator sandbox API key (for P1-T4 only); sample CSV statements from each bank
with real data removed.

---

### P1-T1 — Bank tables **[REVIEW]**
- `bank_accounts`: `id`, `bank_name`, `account_name`, `account_last4`, `source` (`aggregator` | `csv`),
  `last_synced_at`, `is_active`.
- `bank_transactions`: `id`, `bank_account_id`, `external_id`, `occurred_at`, `amount bigint` (>0),
  `direction` (`in` | `out`), `description_raw`, `balance_after bigint null`, `created_at`.
- UNIQUE (`bank_account_id`, `external_id`). Immutable: revoke UPDATE/DELETE.
- **Done when:** tests prove duplicates are rejected and rows can't be changed.

### P1-T2 — CSV import
- Parser per bank format (start with the banks the business uses). Normalize to the transaction shape.
- `external_id` for CSV = stable hash of (account, date, amount, direction, description, row sequence
  within same day).
- Preview screen before import: counts, duplicates skipped, errors.
- **Done when:** importing the same file twice creates zero new rows; parser tests per bank pass.

### P1-T2a — CSV import pipeline (template format)
- One documented template CSV (date, description, amount, balance) so import works before bank samples arrive.
- external_id hash, preview (new / duplicates / errors), idempotent import.

### P1-T2b — Parsers per bank
- One parser per bank format, normalizing to the same shape. **Blocked** until sample statements are provided.

### P1-T3 — Sync engine with adapter interface **[REVIEW]**
- `BankSourceAdapter` interface: `fetchTransactions(account, since)`, `fetchBalance(account)`.
- `MockAdapter` returning realistic fake data.
- Scheduled sync job: fetch → upsert idempotently → update `last_synced_at` → trigger classification.
- Retries with backoff; failures logged; never partial-commit a batch.
- **Done when:** running the job repeatedly produces no duplicates; failure test leaves DB consistent.

### P1-T4 — Real aggregator adapter
- Implement the chosen aggregator's adapter against its **sandbox**. Verify webhook signatures if used.
- If no API key yet: mark BLOCKED in `PROGRESS.md` and move on to P1-T5. Come back later.
- **Done when:** sandbox transactions appear in staging.

### P1-T5 — Categories
- `categories`: `id`, `name`, `type` (`in` | `out`), `report_group`, `is_system`.
- Seed: Subscription income, Partial payment, Other income, Salary, Rent, Servers & hosting, Internet,
  Software, Office supplies, Equipment, Marketing, Bank fees, Transfer between own accounts, Other.
- **Done when:** seed runs; owner can add categories.

### P1-T6 — Entries and rules engine **[REVIEW]**
- `entries`: `id`, `bank_transaction_id` (unique), `category_id null`, `customer_id null`,
  `invoice_id null`, `is_recurring bool`, `status` (`auto` | `labelled` | `needs_label`), `note`,
  `updated_by`, `updated_at`.
- `rules`: `id`, `match_field`, `match_type` (`contains` | `equals` | `regex`), `pattern`, `direction`,
  `category_id`, `is_recurring`, `priority`, `created_from_entry_id`, `is_active`.
- Engine: for each new transaction create an entry; apply the highest-priority matching rule;
  no match → `needs_label`. Transfers between own accounts detected and excluded from in/out totals.
- All entry changes go through `withAudit()`.
- **Done when:** unit tests cover priority, no-match, own-transfer detection, and re-running is safe.

### P1-T7 — Money in & out screen
- List with filters (All, Money in, Money out, Matched to invoices), date range, search.
- Amounts: green with `+` for in, ink with `−` for out, tabular numbers.
- **Done when:** handles 10k rows smoothly (pagination or virtualization).

### P1-T8 — Needs-label inbox
- Box at the top of Money in & out: bank description, amount, suggested categories (top 3 by similarity),
  "Something else…", checkbox "Label [payee] this way from now on" (creates a rule).
- **Done when:** labelling one item with the checkbox auto-labels matching future transactions (tested).

### P1-T9 — Transaction detail
- Raw bank data (read-only), editable category/note, change history from `audit_log`.
- **Done when:** edits appear in history with actor and time.

### P1-T10 — Bank connections screen
- List accounts, source, last sync, status. Connect (aggregator), upload CSV.
- Alert when no successful sync for more than 6 hours (configurable).
- **Done when:** stale-sync alert shows in sidebar and Home placeholder.

### P1-T11 — Categories & rules screen (owner)
- View, edit, deactivate rules; see how many transactions each rule labelled.
- **Done when:** deactivating a rule does not change past entries.

---

## Phase 1 acceptance
- [ ] Re-sync and re-import are idempotent (tested)
- [ ] Bank rows immutable (tested)
- [ ] ≥80% of seeded fake transactions auto-labelled after rules are created
- [ ] Human reviewed P1-T1, P1-T3, P1-T6
