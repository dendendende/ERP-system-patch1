-- P1-T5: categories ("what was this money for").
-- report_group rolls categories up for reports; 'transfer' is excluded from in/out totals (P1-T6).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('in', 'out')),
  report_group text not null check (btrim(report_group) <> ''),
  is_system boolean not null default false,
  unique (name, type)
);

alter table public.categories enable row level security;

-- Whole team reads. The owner adds, renames and removes their own categories;
-- built-in (is_system) ones can't be changed or removed, and nobody can create new built-ins.
revoke all on public.categories from anon, authenticated;
grant select, insert, update, delete on public.categories to authenticated;

create policy categories_select on public.categories
  for select to authenticated using (public.current_app_role() is not null);
create policy categories_owner_insert on public.categories
  for insert to authenticated
  with check (public.current_app_role() = 'owner' and not is_system);
create policy categories_owner_update on public.categories
  for update to authenticated
  using (public.current_app_role() = 'owner' and not is_system)
  with check (public.current_app_role() = 'owner' and not is_system);
create policy categories_owner_delete on public.categories
  for delete to authenticated
  using (public.current_app_role() = 'owner' and not is_system);

select public.enable_audit('public.categories');

-- Own-account transfers go both ways, so that category exists once per direction.
insert into public.categories (name, type, report_group, is_system) values
  ('Subscription income', 'in', 'subscriptions', true),
  ('Partial payment', 'in', 'subscriptions', true),
  ('Other income', 'in', 'other_income', true),
  ('Transfer between own accounts', 'in', 'transfer', true),
  ('Salary', 'out', 'people', true),
  ('Rent', 'out', 'office', true),
  ('Servers & hosting', 'out', 'tech', true),
  ('Internet', 'out', 'office', true),
  ('Software', 'out', 'tech', true),
  ('Office supplies', 'out', 'office', true),
  ('Equipment', 'out', 'equipment', true),
  ('Marketing', 'out', 'marketing', true),
  ('Bank fees', 'out', 'bank_fees', true),
  ('Transfer between own accounts', 'out', 'transfer', true),
  ('Other', 'out', 'other', true);
