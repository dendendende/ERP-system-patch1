# Phase 2 — Customers, Subscriptions, Invoices, Matching

**Goal:** invoices generate themselves from subscriptions, and incoming bank money is matched to
invoices automatically — including partial payments.
**Branch:** `phase-2-billing`

---

### P2-T1 — Customers and subscriptions tables
- `customers`: `id`, `name`, `whatsapp_number`, `billing_email`, `notes`, `is_active`, `created_at`.
- `subscriptions`: `id`, `customer_id`, `plan_name`, `price bigint`, `cycle` (`monthly` | `quarterly` |
  `yearly`), `start_date`, `end_date null`, `next_invoice_date`, `status` (`active` | `paused` | `ended`).
- Store phone numbers in E.164 format (`+62…`).
- **Done when:** migrations + RLS + fake seed data exist.

### P2-T2 — Invoices and unique amounts **[REVIEW]**
- `invoices`: `id`, `number` (e.g. `INV-0001`, sequential, never reused), `customer_id`,
  `subscription_id null`, `base_amount bigint`, `unique_code int`, `unique_amount bigint`,
  `issued_on`, `due_on`, `status` (`open` | `partly_paid` | `paid` | `void`), `created_by`.
- Unique code: 1–999 added to the base amount. Must not collide with any **open or partly paid** invoice's
  outstanding unique amount. Enforce inside a DB transaction with a lock (or partial unique index).
- Void instead of delete.
- **Done when:** concurrency test (many invoices created in parallel) produces zero collisions.

### P2-T3 — Payments and invoice status **[REVIEW]**
- `payments`: `id`, `bank_transaction_id`, `invoice_id`, `amount_applied bigint`, `method`
  (`auto` | `manual`), `created_by`, `created_at`.
- Constraint: sum of `amount_applied` per bank transaction ≤ transaction amount.
- Invoice status derived from payments (DB function or view, not a hand-edited field).
- For a partly paid invoice, generate a **new unique amount for the remaining balance**.
- **Done when:** tests cover full, partial, overpayment, and one transfer paying two invoices.

### P2-T4 — Matching engine **[REVIEW]**
Runs after each sync, only on `in` transactions not yet matched.
1. Exact unique amount match on an open invoice → apply.
2. Invoice number found in bank description → apply up to the outstanding amount.
3. Amount equals remaining balance of exactly one partly paid invoice for a known payer name → apply.
4. Otherwise → leave in `needs_label` with suggested invoices.
- Never auto-match when more than one candidate fits. Ambiguity goes to a human.
- Matched entries get category Subscription income / Partial payment and the customer link.
- **Done when:** unit tests for each rule, ambiguity, and re-run safety pass.

### P2-T5 — Auto-invoicing job
- Daily job (Asia/Jakarta): for active subscriptions where `next_invoice_date` = today + lead days
  (default 14), create the invoice, advance `next_invoice_date`.
- Idempotent: never two invoices for the same subscription period.
- **Done when:** running the job twice on the same day creates one invoice.

### P2-T6 — Customer list
- Search; filters: All, Late, Renewing soon, Active, Ended. Columns: name, still owed, next due, status.
- **Done when:** filters are correct against seeded data.

### P2-T7 — Customer detail
- Header sentence (e.g. "Paid part of their invoice. Rp 12 jt left, due 20 September.").
- Invoice card: total / paid / still owed + progress bar, current unique amount to transfer.
- Subscription card. Reminder timeline area (placeholder until Phase 3).
- **Done when:** matches the "Customer billing" canvas screen.

### P2-T8a — Invoice form
- Create an invoice (operator, owner); edit due date and notes; void with a reason.
- Amount changes are void + reissue, never an edit.
- **Done when:** validation and role tests pass.

### P2-T8b — Subscription form
- Create and edit a subscription (owner only): plan, price, cycle, dates, pause/end.
- **Done when:** validation and role tests pass.

### P2-T9 — Manual matching and mark-as-paid **[REVIEW]**
- Operators can link a `needs_label` incoming transaction to an invoice (creates a manual payment, audited).
- **Owner-only** "mark as paid without bank transaction": requires reason, audited, flagged for the weekly summary.
- **Done when:** operator attempt at mark-as-paid is rejected by RLS (tested).

---

## Phase 2 acceptance
- [ ] Zero unique-amount collisions under concurrency (tested)
- [ ] Partial and multi-invoice payments correct (tested)
- [ ] Ambiguous payments never auto-matched (tested)
- [ ] Human reviewed P2-T2, P2-T3, P2-T4, P2-T9
