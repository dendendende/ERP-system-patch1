-- P2-T3: payments, and invoice status derived from them.
--
-- A payment says "this much of this bank transfer pays this invoice". One transfer can pay
-- several invoices; one invoice can be paid by several transfers. Nobody edits an invoice's
-- status: refresh_invoice() recomputes it from the payments every time one is added.
--
-- amount_due is what the invoice asks for in total. It starts at base + unique code. When an
-- invoice is partly paid, the rest gets a fresh unique code on top (so the next transfer can
-- only mean this invoice), and amount_due grows by that code — at most Rp 999 each time.

alter table public.invoices add column amount_due bigint;
update public.invoices set amount_due = unique_amount;
alter table public.invoices
  alter column amount_due set not null,
  add check (amount_due >= base_amount);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references public.bank_transactions (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount_applied bigint not null check (amount_applied > 0),
  method text not null check (method in ('auto', 'manual')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index payments_invoice_idx on public.payments (invoice_id);
create index payments_transaction_idx on public.payments (bank_transaction_id);

-- Paid so far, and what is still owed.
create or replace function public.invoice_paid(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(p.amount_applied), 0)::bigint
    from public.payments p where p.invoice_id = p_invoice_id;
$$;

-- Money from a bank transfer not yet applied to any invoice.
create or replace function public.transaction_unapplied(p_bank_transaction_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select t.amount - coalesce((select sum(p.amount_applied) from public.payments p
                               where p.bank_transaction_id = t.id), 0)
    from public.bank_transactions t where t.id = p_bank_transaction_id;
$$;

grant execute on function public.invoice_paid(uuid) to authenticated;
grant execute on function public.transaction_unapplied(uuid) to authenticated;

-- Recompute status (and the amount to ask for) from payments. Caller holds the invoice row lock.
create or replace function public.refresh_invoice(p_invoice_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  inv public.invoices;
  paid bigint;
  remaining bigint;
  code integer;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if inv.status = 'void' then
    return;
  end if;
  paid := public.invoice_paid(p_invoice_id);
  remaining := inv.amount_due - paid;

  if remaining <= 0 then
    update public.invoices set status = 'paid', transfer_amount = null where id = p_invoice_id;
  elsif paid = 0 then
    return; -- untouched: still open, still asking for the original unique amount
  else
    -- Called after each new payment: a fresh unique amount for the rest, and amount_due grows
    -- by the new code. (The search skips this invoice's own current amount too; harmless.)
    perform public.lock_unique_amounts();
    code := public.free_unique_code(remaining);
    if code is null then
      raise exception 'No free unique amount near % for the rest of %', remaining, inv.number;
    end if;
    update public.invoices
       set status = 'partly_paid',
           amount_due = inv.amount_due + code,
           transfer_amount = remaining + code
     where id = p_invoice_id;
  end if;
end;
$$;

revoke all on function public.refresh_invoice(uuid) from public, anon, authenticated;

-- The only way a payment is recorded: people matching by hand (owner/operator, 'manual') and
-- the matching engine (service_role, 'auto'). Checks, under row locks on both sides:
--   • the transfer is money coming in, and still has enough unapplied money
--   • the invoice is still waiting for money, and this doesn't pay more than it still owes
create or replace function public.apply_payment(
  p_invoice_id uuid,
  p_bank_transaction_id uuid,
  p_amount bigint,
  p_method text default 'manual'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  tx public.bank_transactions;
  pay public.payments;
  owed bigint;
begin
  if current_setting('role') <> 'service_role'
     and coalesce(public.current_app_role()::text, '') not in ('owner', 'operator') then
    raise exception 'Not allowed to record payments' using errcode = 'insufficient_privilege';
  end if;
  if p_method = 'auto' and current_setting('role') <> 'service_role' then
    raise exception 'Only the matching engine records automatic payments'
      using errcode = 'insufficient_privilege';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'A payment must be more than zero' using errcode = 'check_violation';
  end if;

  -- lock order: transaction, then invoice (the matching engine uses the same order)
  select * into tx from public.bank_transactions where id = p_bank_transaction_id for update;
  if tx.id is null then
    raise exception 'Bank transaction not found';
  end if;
  if tx.direction <> 'in' then
    raise exception 'Only money coming in can pay an invoice' using errcode = 'check_violation';
  end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null or inv.status not in ('open', 'partly_paid') then
    raise exception 'This invoice is not waiting for money' using errcode = 'check_violation';
  end if;

  owed := inv.amount_due - public.invoice_paid(p_invoice_id);
  if p_amount > owed then
    raise exception 'That is more than the invoice still owes (%)', owed
      using errcode = 'check_violation';
  end if;
  if p_amount > public.transaction_unapplied(p_bank_transaction_id) then
    raise exception 'That transfer does not have that much money left to apply'
      using errcode = 'check_violation';
  end if;

  insert into public.payments (bank_transaction_id, invoice_id, amount_applied, method)
  values (p_bank_transaction_id, p_invoice_id, p_amount, p_method)
  returning * into pay;

  perform public.refresh_invoice(p_invoice_id);
  return pay;
end;
$$;

revoke all on function public.apply_payment(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.apply_payment(uuid, uuid, bigint, text) to authenticated, service_role;

-- create_invoice now fills amount_due too.
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
    (number, customer_id, subscription_id, base_amount, unique_code, transfer_amount, amount_due,
     issued_on, due_on, notes)
  values
    (public.invoice_number(n), p_customer_id, p_subscription_id, p_base_amount, code,
     p_base_amount + code, p_base_amount + code, p_issued_on, p_due_on, coalesce(p_notes, ''))
  returning * into inv;
  return inv;
end;
$$;

alter table public.payments enable row level security;

-- Read: the whole team. Write: only through apply_payment(). Payments are never edited or
-- deleted (a wrong match is corrected by P2-T9's tools, audited).
revoke all on public.payments from anon, authenticated, service_role;
grant select on public.payments to authenticated, service_role;
create policy payments_select on public.payments
  for select to authenticated using (public.current_app_role() is not null);

create trigger payments_no_update_delete
  before update or delete on public.payments
  for each row execute function public.forbid_change();

select public.enable_audit('public.payments');
