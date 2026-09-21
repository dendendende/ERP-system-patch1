-- P2-T4: the matching engine — which invoice did this incoming transfer pay?
--
-- A transfer fits an invoice when (all on invoices still waiting for money, issued on or before
-- the day the money came in):
--   1. its amount is exactly the invoice's unique amount to transfer
--   2. the bank description names the invoice number (INV-0012, INV0012, inv 12 …)
--   3. its amount is exactly what is left on a partly paid invoice, and the description names
--      that invoice's customer
-- Exactly one invoice fits → pay it (up to what it still owes). Two or more → a person decides:
-- nothing is applied. The same function lists the fits (plus weaker hints) as suggestions.

-- Invoices that fit one incoming transfer. strong = one of the three rules above; weak = only a
-- hint for a person (the customer is named, or the amount is no more than what is still owed).
create or replace function public.invoice_candidates(p_bank_transaction_id uuid)
returns table (invoice_id uuid, strong boolean)
language sql
stable
set search_path = ''
as $$
  with tx as (
    select t.amount, lower(t.description_raw) as description,
           (t.occurred_at at time zone 'Asia/Jakarta')::date as day
      from public.bank_transactions t
     where t.id = p_bank_transaction_id and t.direction = 'in'
  ),
  numbers as (
    select distinct m[1]::bigint as n
      from tx, regexp_matches(tx.description, 'inv[\s\-]*0*([0-9]{1,12})', 'g') as m
  ),
  waiting as (
    select i.id, i.transfer_amount, i.status, i.amount_due - public.invoice_paid(i.id) as owed,
           substring(i.number from 5)::bigint as n,
           strpos(tx.description, lower(c.name)) > 0 as names_customer,
           tx.amount
      from public.invoices i
      join public.customers c on c.id = i.customer_id
      cross join tx
     where i.status in ('open', 'partly_paid') and i.issued_on <= tx.day
  )
  select w.id,
         bool_or(
           w.amount = w.transfer_amount
           or w.n in (select n from numbers)
           or (w.status = 'partly_paid' and w.amount = w.owed and w.names_customer)
         )
    from waiting w
   where w.amount = w.transfer_amount
      or w.n in (select n from numbers)
      or w.names_customer
      or w.amount <= w.owed
   group by w.id;
$$;

revoke all on function public.invoice_candidates(uuid) from public, anon;
grant execute on function public.invoice_candidates(uuid) to authenticated, service_role;

-- Runs after every sync and CSV import, over incoming transfers not matched yet. Safe to run
-- any number of times: a transfer with any payment on it, or labelled by a person, or found to
-- be a transfer between own accounts, is never looked at again.
create or replace function public.match_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx record;
  inv_id uuid;
  fits integer;
  to_apply bigint;
  inv_status text;
  matched integer := 0;
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the matching engine runs matching' using errcode = 'insufficient_privilege';
  end if;

  for tx in
    select t.id, t.amount, e.id as entry_id
      from public.bank_transactions t
      join public.entries e on e.bank_transaction_id = t.id
      left join public.categories c on c.id = e.category_id
     where t.direction = 'in'
       and e.invoice_id is null
       and e.status <> 'labelled'
       and c.report_group is distinct from 'transfer'
       and not exists (select 1 from public.payments p where p.bank_transaction_id = t.id)
     order by t.occurred_at
  loop
    -- Lock the transfer (same order as apply_payment: transfer, then invoice) and look again:
    -- a person may have matched it by hand since the list above was read.
    perform 1 from public.bank_transactions t where t.id = tx.id for update;
    continue when exists (select 1 from public.payments p where p.bank_transaction_id = tx.id);

    select count(*), min(ic.invoice_id::text)::uuid into fits, inv_id
      from public.invoice_candidates(tx.id) ic where ic.strong;
    continue when fits <> 1;

    -- One transfer that can't be applied (e.g. someone matched it by hand a moment ago) must not
    -- stop the rest: each runs in its own savepoint and is left for a person on failure.
    begin
      -- enough for the amount we asked for (unique code included) → that amount; else at most
      -- what is still owed. Anything above stays unapplied on the transfer.
      select case when tx.amount >= i.transfer_amount then i.transfer_amount
                  else least(tx.amount, i.amount_due - public.invoice_paid(i.id)) end
        into to_apply
        from public.invoices i where i.id = inv_id;
      perform public.apply_payment(inv_id, tx.id, to_apply, 'auto');

      select i.status into inv_status from public.invoices i where i.id = inv_id;
      update public.entries e
         set invoice_id = inv_id,
             customer_id = i.customer_id,
             category_id = c.id,
             status = 'auto',
             rule_id = null
        from public.invoices i, public.categories c
       where e.id = tx.entry_id and i.id = inv_id
         and c.is_system and c.type = 'in'
         and c.name = case when inv_status = 'paid' then 'Subscription income' else 'Partial payment' end;
      matched := matched + 1;
    exception when others then
      raise warning 'matching skipped transaction %: %', tx.id, sqlerrm;
    end;
  end loop;

  return matched;
end;
$$;

revoke all on function public.match_payments() from public, anon, authenticated;
grant execute on function public.match_payments() to service_role;
