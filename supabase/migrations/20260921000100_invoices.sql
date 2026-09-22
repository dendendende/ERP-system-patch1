-- P2-T2: invoices with unique transfer amounts.
--
-- Every open invoice asks for an amount no other open invoice asks for (base + a code 1–999),
-- so an incoming transfer of exactly that amount can only mean one invoice. The amount the
-- customer should transfer *now* lives in transfer_amount: at first base + code; for a partly
-- paid invoice, a fresh unique amount for what is left (P2-T3). A partial unique index makes a
-- collision impossible, and create_invoice() picks a free code under a lock so it never has to
-- hit that index.

create sequence public.invoice_number_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  -- INV-0001…INV-9999, then INV-10000… Sequence numbers are never reused (a rolled-back insert
  -- can leave a gap; numbers are never handed out twice).
  number text not null unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  subscription_id uuid references public.subscriptions (id) on delete restrict,
  base_amount bigint not null check (base_amount > 0),
  unique_code integer not null check (unique_code between 1 and 999),
  unique_amount bigint generated always as (base_amount + unique_code) stored,
  -- what to ask the customer to transfer right now; null once paid or void
  transfer_amount bigint check (transfer_amount > 0),
  issued_on date not null,
  due_on date not null check (due_on >= issued_on),
  status text not null default 'open' check (status in ('open', 'partly_paid', 'paid', 'void')),
  notes text not null default '',
  void_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((status in ('open', 'partly_paid')) = (transfer_amount is not null)),
  check ((status = 'void') = (void_reason is not null))
);

-- The guarantee: two invoices waiting for money never ask for the same amount.
create unique index invoices_transfer_amount_unique
  on public.invoices (transfer_amount) where status in ('open', 'partly_paid');
create index invoices_customer_idx on public.invoices (customer_id);
create index invoices_open_idx on public.invoices (due_on) where status in ('open', 'partly_paid');

alter table public.entries
  add foreign key (invoice_id) references public.invoices (id) on delete restrict;

-- INV-0001…INV-9999, then INV-10000 (lpad alone would cut 10000 down to "1000").
create or replace function public.invoice_number(n bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'INV-' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
$$;

-- Smallest free code for `p_base` among invoices still waiting for money. Caller holds the lock.
create or replace function public.free_unique_code(p_base bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select c
    from generate_series(1, 999) as c
   where not exists (
     select 1 from public.invoices i
      where i.status in ('open', 'partly_paid') and i.transfer_amount = p_base + c
   )
   order by c
   limit 1;
$$;

revoke all on function public.free_unique_code(bigint) from public, anon, authenticated;

-- ponytail: one global lock for choosing unique amounts; invoice creation is a few per minute
-- at most. Lock per amount range if it ever becomes a bottleneck.
create or replace function public.lock_unique_amounts()
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtext('invoices.unique_amount'));
$$;

revoke all on function public.lock_unique_amounts() from public, anon, authenticated;

-- The only way invoices are created (people via the app, and the auto-invoicing job).
create or replace function public.create_invoice(
  p_customer_id uuid,
  p_base_amount bigint,
  p_issued_on date,
  p_due_on date,
  p_subscription_id uuid default null,
  p_notes text default ''
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  code integer;
  n bigint;
  inv public.invoices;
begin
  -- current_setting('role') is the caller's role; current_user is this function's owner here
  if current_setting('role') <> 'service_role'
     and coalesce(public.current_app_role()::text, '') not in ('owner', 'operator') then
    raise exception 'Not allowed to create invoices' using errcode = 'insufficient_privilege';
  end if;

  perform public.lock_unique_amounts();
  code := public.free_unique_code(p_base_amount);
  if code is null then
    raise exception 'No free unique amount near % — 999 invoices are already waiting for it', p_base_amount;
  end if;

  n := nextval('public.invoice_number_seq');
  insert into public.invoices
    (number, customer_id, subscription_id, base_amount, unique_code, transfer_amount,
     issued_on, due_on, notes)
  values
    (public.invoice_number(n),
     p_customer_id, p_subscription_id, p_base_amount, code, p_base_amount + code,
     p_issued_on, p_due_on, coalesce(p_notes, ''))
  returning * into inv;
  return inv;
end;
$$;

revoke all on function public.create_invoice(uuid, bigint, date, date, uuid, text) from public, anon;
grant execute on function public.create_invoice(uuid, bigint, date, date, uuid, text)
  to authenticated, service_role;

-- Void instead of delete: the number stays used, the amount is freed for other invoices.
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
begin
  if coalesce(public.current_app_role()::text, '') not in ('owner', 'operator') then
    raise exception 'Not allowed to void invoices' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the invoice is being voided' using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', p_reason, true);
  update public.invoices
     set status = 'void', transfer_amount = null, void_reason = p_reason
   where id = p_invoice_id and status in ('open', 'partly_paid')
  returning * into inv;
  if inv.id is null then
    raise exception 'Only an invoice still waiting for money can be voided';
  end if;
  return inv;
end;
$$;

revoke all on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated;

alter table public.invoices enable row level security;

-- Read: the whole team. Create and void: only through the functions above. Direct edits:
-- due date and notes only (amount changes = void + reissue, P2-T8). Never delete.
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;
grant update (due_on, notes) on public.invoices to authenticated;
create policy invoices_select on public.invoices
  for select to authenticated using (public.current_app_role() is not null);
create policy invoices_update on public.invoices
  for update to authenticated
  using (public.current_app_role() in ('owner', 'operator'))
  with check (public.current_app_role() in ('owner', 'operator'));

create trigger invoices_no_delete
  before delete on public.invoices
  for each row execute function public.forbid_change();

select public.enable_audit('public.invoices');
