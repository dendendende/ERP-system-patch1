# UPGRADE v2 — ERP-Grade UX, Density, and Reporting

**Status:** the app is ~70% built. The data layer stays. This document replaces the UI layer and
adds the reporting features that make it feel like a real finance system instead of a list of text.

**Read this with `CLAUDE.md`.** All money rules, security rules, and the review protocol still apply.
Work task by task, commit after each, update `PROGRESS.md`.

---

## 1. What SAP Fiori and Dynamics 365 actually do (research summary)

**SAP Fiori** is built on five design principles: role-based, adaptive, simple, coherent, delightful.
Role-based is the biggest shift from classic ERP screens: the interface shows only what a given
person's job needs, at the right time, instead of exposing every function.

Fiori standardises screens into reusable **floorplans** rather than inventing a layout per page.
The three that matter for us:

| Floorplan | Purpose | Where we use it |
|---|---|---|
| **Overview page** | Entry screen made of cards pulling data from several apps; stands alone, never nested | Home |
| **Analytical list page** | Chart + filter bar + table of the same dataset, filtered together, drill-down to detail | Money in & out, Invoices, Customers |
| **Object page** | One business object: a header of key facts, then sections, with anchor navigation | Customer, Invoice, Transaction |

**Microsoft Dynamics 365 Business Central** uses **Role Centers**: a personalised home page per role
(Finance Manager, Accountant, etc.) that combines KPIs, task lists, charts, and shortcuts so users
don't hunt through menus. Its core unit is the **Cue**: a tile showing one aggregated number
(like open sales invoices) that is **clickable and drills down** to the filtered list behind it.
Cues come in a normal tile layout and a **wide layout for large monetary values**, and the
recommended page order is headline first, then cues, then everything else. Business Central also
ships 300+ built-in reports, and role centers support saved views, embedded charts, and
notification indicators.

**The two transferable lessons:**

1. **Every number is a door.** In both systems, a KPI is never just text; it opens the filtered list
   that produced it. Our current UI shows numbers as dead text. That alone is why it feels thin.
2. **Layout is a system, not a page.** They reuse three or four floorplans everywhere, so screens
   feel dense yet predictable. We should do the same instead of designing each screen freehand.

---

## 2. Diagnosis of the current UI

| Problem | Cause | Fix |
|---|---|---|
| "Too simple" | Each screen shows one level of information, with no second layer to explore | Floorplans with header + filter + chart + table |
| "Too much text" | Explanations written as sentences where a number, chart, or status colour would do | Sentence becomes a caption under a number, not the content itself |
| Feels static | Nothing is clickable except navigation | Every KPI, status, and chart segment is a drill-down filter |
| No sense of control | No filters, no saved views, no bulk actions | Filter bar + saved views + multi-select actions |
| No comparison | Numbers shown alone | Every KPI carries trend vs last period and vs target |

**Keep this, do not lose it:** plain language. The rule becomes **two layers, not one**:
a plain-language headline on top (for the owner), dense interactive data underneath (for daily work).
That's the difference between "understandable" and "simple".

---

## 3. The UX system to build

### 3.1 Role-based home (Role Center)

Three role views of the same Home screen, chosen by the logged-in role:

- **Owner:** cash position, forecast, health, concentration, approvals
- **Finance operator:** needs-label queue, unmatched payments, overdue list, today's reminders
- **Viewer:** read-only owner view without actions

Layout order (follows Business Central's recommendation): **headline → cues → charts → lists → shortcuts.**

### 3.2 Cue tiles

A cue is: label, big number, unit, trend arrow vs last period, status colour, and a click target.

- Status colour comes from thresholds in `health_thresholds`, never hardcoded.
- Wide layout for rupiah values, normal tiles for counts.
- Clicking a cue opens the list it summarises, **already filtered**.
- Cues load independently and show skeletons, so one slow query never blocks the page.

### 3.3 Analytical list page (the workhorse)

Used by Money in & out, Invoices, Customers, Reminders. Structure, top to bottom:

1. **Filter bar:** date range, direction, category, customer, status, amount range; chips for active
   filters; "Save this view" and a view switcher.
2. **Chart strip:** 2–3 compact charts of the *filtered* data (e.g. monthly in/out, category split,
   aging buckets). Clicking a bar or segment adds that filter.
3. **Table:** dense rows (40–44px), tabular figures, right-aligned amounts, sortable columns,
   column chooser, sticky header, virtualized scrolling, multi-select with bulk actions,
   totals row, CSV/Excel export.
4. **Drill-down:** row click opens the object page in a side panel (flexible column layout), so the
   user keeps their place in the list.

### 3.4 Object page

Header: title, status, 4–6 key facts, primary actions. Then anchored sections (Overview, Invoices,
Payments, Reminders, History). Sticky anchor nav. Same shape for customer, invoice, transaction.

### 3.5 Density and visual rules (update to the design system)

- Row height 40px desktop; 13–14px table text; 8px spacing grid.
- All money: tabular figures, right-aligned, thousands separators, no decimals for rupiah.
- Negative/outflow in rust, inflow in green, neutral in ink. Status colour never the only signal —
  always pair with text or icon.
- Charts: no gradients, no 3D, max 6 series, direct labels over legends where possible.
- Transitions stay 150–250ms; side panel slides, list stays put.
- Keyboard: `/` focus search, `j/k` move rows, `Enter` open, `Esc` close panel, `Cmd+K` command palette.

---

## 4. Dashboard data — what Home must report

These are the numbers an ERP finance role center would carry, adapted to a subscription business.
Formulas are specified so there is no guessing.

### 4.1 Cash and liquidity (owner cues)

| Metric | Formula | Default target |
|---|---|---|
| Cash position | Sum of latest balances across bank accounts | — |
| Cash runway (months) | Cash ÷ average monthly recurring outflow (3-month avg) | > 12 |
| Net cashflow this month | Money in − money out, excluding own-account transfers | > 0 |
| Forecast low point (90 days) | From the forecast engine | stays above a floor the owner sets |
| Forecast accuracy | Actual vs forecast for the closed month (%) | within 10% |

### 4.2 Receivables (the heart of an AR dashboard)

| Metric | Formula | Benchmark |
|---|---|---|
| Total outstanding | Sum of unpaid invoice balances | — |
| **Aging buckets** | Current, 1–30, 31–60, 61–90, 90+ days past due | past-due (31+) under 10–15%; over 20–25% in the 90+ bucket is high risk |
| % overdue | Past-due ÷ total outstanding × 100 | under 10–15% |
| **DSO** (days sales outstanding) | (Receivables ÷ credit sales) × days in period | SaaS typically 30–45 days |
| **CEI** (collection effectiveness) | Collected during period ÷ amount that was collectible × 100 | 85–95% |
| Bucket migration | % of a bucket that slid into the next one | watch: predicts write-offs |
| Top 10 overdue | Ranked by amount, with days late and last contact | — |
| Customer concentration | Biggest customer's share of revenue | under 20% |

Note for the owner-facing layer: DSO and CEI are finance jargon. Show them with plain captions —
DSO as "Customers take X days on average to pay you", CEI as "You collected X% of what was due".

### 4.3 Subscription revenue

| Metric | Formula |
|---|---|
| MRR / ARR | Sum of active subscription prices, normalised to monthly / yearly |
| New vs churned MRR this month | Added − lost |
| Renewal rate | Renewed ÷ due for renewal, last 12 months |
| Renewals due (30/60/90 days) | Count + value, risky ones flagged |
| Revenue by plan / by customer | Ranked, with share % |

### 4.4 Spending

Spend by category this month vs 3-month average; recurring vs one-off split; top 10 payees;
any category more than 30% above its usual level (flagged automatically).

### 4.5 Operations (operator cues)

Transactions needing a label; unmatched incoming payments; reminders scheduled today;
failed message deliveries; bank sync status; balance mismatch; manual mark-as-paid actions this week.

---

## 5. Feature upgrades

1. **Drill-down everywhere** — every cue, chart segment, and status opens a filtered list.
2. **Saved views** — per user, per list; a default view per role.
3. **Bulk actions** — label many transactions at once, send reminders to selected customers,
   void selected draft invoices (all audited).
4. **Command palette (Cmd+K)** — jump to a customer, invoice, or screen; run common actions.
5. **Global search** — customers, invoices, transactions, in one box.
6. **Export** — every list exports to CSV/Excel; report pack exports to PDF.
7. **Report library** — a Reports section with ready-made, parameterised reports:
   cashflow statement by month, AR aging detail, customer statement (sendable to a customer),
   revenue by plan, spend by category, reminder effectiveness, audit extract.
   This is the ERP "ready-made report library" idea, scaled down to ~8 reports that matter.
8. **Customer statement** — one page per customer: invoices, payments, balance, sendable by email.
9. **Notifications centre** — in-app alerts for mismatch, failed sync, failed delivery, big new payee.
10. **Period comparison** — every chart has "vs last month / vs last year" toggle.
11. **Personalisation** — column chooser, cue ordering, hide cues; saved per user.
12. **Multi-account view** — cash per bank account and a combined total.

**Still out of scope:** tax/Coretax, payment gateway, native mobile app, multi-currency, inventory,
AI chat assistant.

---

## 6. Tasks

Add these to `PROGRESS.md`. Same protocol: one task at a time, tests, commit, tick.

### Phase 7 — Design system v2 and floorplans
Branch: `phase-7-ux-v2`

- **P7-T1** Density tokens + table primitives: row heights, tabular figures, status colours tied to
  thresholds, skeleton loaders. Update `/dev/components`.
- **P7-T2** `<FilterBar>`: typed filters, chips, URL-synced state, save/load views.
- **P7-T3** `saved_views` table + API (per user, per list, default per role). **[REVIEW]** (RLS)
- **P7-T4** `<DataTable>`: virtualized, sortable, column chooser, multi-select, bulk action bar,
  totals row, CSV export. Must handle 50k rows at 60fps (benchmark test).
- **P7-T5** `<Cue>` tile: value, unit, trend vs previous period, status colour, click-through target,
  wide and normal layouts, independent loading.
- **P7-T6** `<AnalyticalListPage>` shell composing filter bar + chart strip + table + side panel.
- **P7-T7** `<ObjectPage>` shell: header facts, anchor sections, side-panel mode.
- **P7-T8** Chart library wrappers: bar, line, stacked bar, aging bars, donut — click emits a filter.
- **P7-T9** Command palette + global search.
- **P7-T10** Keyboard navigation and focus management across list and panel.

### Phase 8 — Metrics engine and role-based Home
Branch: `phase-8-metrics`

- **P8-T1** `metrics` module: one tested function per metric in §4, each returning value, previous
  value, trend, status, and the filter that reproduces it. **[REVIEW]**
- **P8-T2** Aging buckets + DSO + CEI + bucket migration, with fixed-dataset tests. **[REVIEW]**
- **P8-T3** MRR/ARR, renewal rate, revenue by plan/customer, concentration. **[REVIEW]**
- **P8-T4** Spending analytics + anomaly flag (category > 30% above 3-month average).
- **P8-T5** Nightly `metric_snapshots` table so trends and history survive; Home reads snapshots
  plus live values for today.
- **P8-T6** Home as Role Center: role-aware cue sets, order headline → cues → charts → lists,
  personalisation (reorder, hide), every cue drills down.
- **P8-T7** Convert Money in & out to the analytical list page.
- **P8-T8** Convert Customers and Invoices to analytical list pages; Customer and Invoice to object pages.
- **P8-T9** Business health screen v2: keep plain sentences, add trend sparkline per signal and
  drill-down to the underlying list.

### Phase 9 — Reports and actions
Branch: `phase-9-reports`

- **P9-T1** Report framework: parameters, run, export PDF/Excel, save favourites.
- **P9-T2** The 8 reports listed in §5.7. **[REVIEW]** on cashflow statement and AR aging math.
- **P9-T3** Customer statement + send by email/WhatsApp (reuses Phase 3 channels).
- **P9-T4** Bulk actions wired: bulk label, bulk reminder, bulk void. All audited. **[REVIEW]**
- **P9-T5** Notifications centre + badge.
- **P9-T6** Period comparison toggle on all charts.
- **P9-T7** Performance pass: Home under 1.5s, list interactions under 100ms, snapshot queries indexed.
- **P9-T8** Accessibility pass: contrast, focus, screen-reader labels on cues and charts,
  `prefers-reduced-motion`.
- **P9-T9** Acceptance fixes: Home's headline numbers and the bill numbers / amounts in its work
  lists open what they count; trend percents in Indonesian format; Settings and Reports show
  where each one stands now.

---

## 7. Acceptance for v2

- [ ] Every number on Home opens the list that produced it
- [ ] Lists have filters, saved views, bulk actions, and export
- [ ] Aging, DSO, CEI, MRR tested against a hand-calculated fixed dataset
- [ ] Home loads under 1.5s with 50k transactions
- [ ] A non-finance person can still read Home's top layer without jargon
- [ ] No screen is only text: each has numbers, status, or a chart carrying the meaning
