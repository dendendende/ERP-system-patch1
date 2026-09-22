-- P1-T1: bank accounts and immutable bank transactions.
-- The app only READS bank data. Rows here are exactly what the bank said; corrections go in `entries`.

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null check (bank_name <> ''),
  account_name text not null check (account_name <> ''),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  source text not null check (source in ('aggregator', 'csv')),
  last_synced_at timestamptz,
  is_active boolean not null default true
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  -- restrict: an account with transactions can be deactivated, never deleted.
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  external_id text not null check (external_id <> ''),
  occurred_at timestamptz not null,
  amount bigint not null check (amount > 0), -- whole rupiah; sign lives in `direction`
  direction text not null check (direction in ('in', 'out')),
  description_raw text not null default '',
  balance_after bigint,
  created_at timestamptz not null default now(),
  -- Re-syncs/re-imports insert with ON CONFLICT DO NOTHING on this key.
  unique (bank_account_id, external_id)
);

create index bank_transactions_account_date_idx
  on public.bank_transactions (bank_account_id, occurred_at desc);
create index bank_transactions_date_idx on public.bank_transactions (occurred_at desc);

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;

-- bank_accounts: whole team reads; only the owner adds or changes accounts. No deletes.
revoke all on public.bank_accounts from anon, authenticated;
grant select, insert, update on public.bank_accounts to authenticated;

create policy bank_accounts_select on public.bank_accounts
  for select to authenticated using (public.current_app_role() is not null);
create policy bank_accounts_owner_insert on public.bank_accounts
  for insert to authenticated with check (public.current_app_role() = 'owner');
create policy bank_accounts_owner_update on public.bank_accounts
  for update to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

select public.enable_audit('public.bank_accounts');

-- bank_transactions: whole team reads; owner/operator can insert (CSV import). The sync job
-- uses service_role. Nobody can UPDATE or DELETE — no privilege, and forbid_change() for everyone
-- else. Corrections go in `entries`.
revoke all on public.bank_transactions from anon, authenticated, service_role;
grant select, insert on public.bank_transactions to authenticated, service_role;

create policy bank_transactions_select on public.bank_transactions
  for select to authenticated using (public.current_app_role() is not null);
create policy bank_transactions_insert on public.bank_transactions
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'operator'));

create trigger bank_transactions_no_update_delete
  before update or delete on public.bank_transactions
  for each row execute function public.forbid_change();

create trigger bank_transactions_no_truncate
  before truncate on public.bank_transactions
  for each statement execute function public.forbid_change();
