-- P9-T10 (from the audit of 2026-10-14):
-- 1. Matching by hand recorded the payment, then linked the transfer's entry to the bill as a
--    second step whose failure went unnoticed. apply_payment now does the link itself for a
--    person's match, inside the same transaction.
-- 2. People could set an entry's bill and customer directly (column grants from P1), pointing a
--    transfer at a bill with no payment — and automatic matching then skipped it for good. Only
--    apply_payment and the matching engine set them now.
-- 3. Money rule 1: the two health limits in rupiah are whole rupiah. The column stays numeric
--    because the other limits are months, days and percentages.

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
  -- exactly the amount we asked for: the customer used the unique code, so it is part of what
  -- they paid for this invoice (not a leftover on the transfer)
  if p_amount = inv.transfer_amount and p_amount > owed then
    update public.invoices set amount_due = amount_due + (p_amount - owed) where id = p_invoice_id;
    owed := p_amount;
  end if;
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

  -- A person matched it: the transfer's entry now points at the bill and its customer, in the
  -- same transaction as the payment, so one never saves without the other. (The matching engine
  -- links its own, marked automatic.) Entries' bill and customer change only this way.
  if p_method = 'manual' then
    update public.entries e
       set invoice_id = p_invoice_id,
           customer_id = inv.customer_id,
           category_id = c.id,
           status = 'labelled',
           rule_id = null,
           updated_by = auth.uid()
      from public.categories c
     where e.bank_transaction_id = p_bank_transaction_id
       and c.is_system and c.type = 'in'
       and c.name = case when (select i.status from public.invoices i where i.id = p_invoice_id) = 'paid'
                         then 'Subscription income' else 'Partial payment' end;
  end if;
  return pay;
end;
$$;

revoke update (invoice_id, customer_id) on public.entries from authenticated;

alter table public.health_thresholds add constraint health_thresholds_whole_rupiah check (
  signal not in ('net_cashflow', 'forecast_low')
  or (healthy_limit = trunc(healthy_limit)
      and (warning_limit is null or warning_limit = trunc(warning_limit)))
);
