-- P9-T1a: favourite reports are saved views of the reports list — a name and the report's own
-- parameters (e.g. report=revenue_by_plan&on=2026-10-31), per person. Same table, same rules
-- (own views private; plain filter characters only; not money data: no audit).

alter table public.saved_views drop constraint saved_views_list_check;
alter table public.saved_views
  add constraint saved_views_list_check
  check (list in ('money', 'customers', 'invoices', 'reminders', 'reports'));
