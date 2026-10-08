-- P6-T4: first-time setup guide. Most steps tick themselves off from the real data (a bank
-- account exists, a subscription is running...); this table remembers the ones the owner
-- marked done or skipped, so the guide picks up where they left off.
create table public.setup_steps (
  step text primary key
    check (step in ('bank', 'money', 'labels', 'customers', 'regular_costs', 'reminders', 'team')),
  done_at timestamptz not null default now(),
  done_by uuid default auth.uid()
);

alter table public.setup_steps enable row level security;
revoke all on public.setup_steps from anon, authenticated;
grant select, insert on public.setup_steps to authenticated;

create policy setup_steps_select on public.setup_steps
  for select to authenticated using (public.current_app_role() is not null);
create policy setup_steps_owner_insert on public.setup_steps
  for insert to authenticated with check (public.current_app_role() = 'owner');
