-- P2-T9: matching by hand, and marking a bill paid when no transfer will ever arrive.
--
-- Two ways a person settles a bill:
--   • they point at the transfer that paid it → apply_payment(…, 'manual'), owner or operator
--   • no transfer exists (cash, a write-off, a swap) → mark_invoice_paid(), OWNER ONLY, with a
--     reason. That money never touched the bank, so every such payment is flagged and can be
--     listed on its own (payments_without_transfer) for the weekly summary.

alter table public.payments
  alter column bank_transaction_id drop not null,
  add column reason text,
  add constraint payments_no_transfer_needs_reason check (
    case when method = 'no_transfer'
      then bank_transaction_id is null and coalesce(btrim(reason), '') <> ''
      else bank_transaction_id is not null
    end
  );

-- 'no_transfer': money the bank never saw, put in by the owner with a reason.
alter table public.payments drop constraint payments_method_check;
alter table public.payments
  add constraint payments_method_check check (method in ('auto', 'manual', 'no_transfer'));

-- Owner only: settle what is left of a bill without a bank transfer. The reason is required,
-- kept on the payment and written to the audit log.
create or replace function public.mark_invoice_paid(p_invoice_id uuid, p_reason text)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  pay public.payments;
  owed bigint;
begin
  if coalesce(public.current_app_role()::text, '') <> 'owner' then
    raise exception 'Only the owner can mark a bill paid without a transfer'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this bill is being marked paid' using errcode = 'check_violation';
  end if;

  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null or inv.status not in ('open', 'partly_paid') then
    raise exception 'This invoice is not waiting for money' using errcode = 'check_violation';
  end if;

  owed := inv.amount_due - public.invoice_paid(p_invoice_id);
  perform set_config('app.audit_reason', p_reason, true);
  insert into public.payments (bank_transaction_id, invoice_id, amount_applied, method, reason)
  values (null, p_invoice_id, owed, 'no_transfer', btrim(p_reason))
  returning * into pay;

  perform public.refresh_invoice(p_invoice_id);
  return pay;
end;
$$;

revoke all on function public.mark_invoice_paid(uuid, text) from public, anon;
grant execute on function public.mark_invoice_paid(uuid, text) to authenticated;

-- Money counted as paid that never came through the bank: worth a second look every week.
create or replace view public.payments_without_transfer with (security_invoker = true) as
  select p.id, p.invoice_id, i.number, i.customer_id, c.name as customer_name,
         p.amount_applied, p.reason, p.created_by, p.created_at
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    join public.customers c on c.id = i.customer_id
   where p.method = 'no_transfer';

grant select on public.payments_without_transfer to authenticated;
