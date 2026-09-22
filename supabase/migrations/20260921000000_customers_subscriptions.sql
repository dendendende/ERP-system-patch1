-- P2-T1: customers and their subscriptions.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  -- E.164 only (+62…): reminders go to exactly this number, so no local formats
  whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  billing_email text check (billing_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- restrict: customers are switched off, never deleted, so their history stays
  customer_id uuid not null references public.customers (id) on delete restrict,
  plan_name text not null check (btrim(plan_name) <> ''),
  price bigint not null check (price > 0), -- whole rupiah per cycle
  cycle text not null check (cycle in ('monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  next_invoice_date date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now()
);

create index subscriptions_customer_idx on public.subscriptions (customer_id);
create index subscriptions_due_idx on public.subscriptions (next_invoice_date) where status = 'active';

-- Entries can now point at the customer who paid (P2-T4 matching sets it).
alter table public.entries
  add foreign key (customer_id) references public.customers (id) on delete restrict;

alter table public.customers enable row level security;
alter table public.subscriptions enable row level security;

-- Customers: team reads; owner and operator add and edit; nobody deletes (switch off instead).
revoke all on public.customers from anon, authenticated;
grant select, insert, update on public.customers to authenticated;
create policy customers_select on public.customers
  for select to authenticated using (public.current_app_role() is not null);
create policy customers_insert on public.customers
  for insert to authenticated with check (public.current_app_role() in ('owner', 'operator'));
create policy customers_update on public.customers
  for update to authenticated
  using (public.current_app_role() in ('owner', 'operator'))
  with check (public.current_app_role() in ('owner', 'operator'));

-- Subscriptions decide what gets billed, so only the owner creates or changes them.
revoke all on public.subscriptions from anon, authenticated;
grant select, insert, update on public.subscriptions to authenticated;
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (public.current_app_role() is not null);
create policy subscriptions_owner_insert on public.subscriptions
  for insert to authenticated with check (public.current_app_role() = 'owner');
create policy subscriptions_owner_update on public.subscriptions
  for update to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');

select public.enable_audit('public.customers');
select public.enable_audit('public.subscriptions');
