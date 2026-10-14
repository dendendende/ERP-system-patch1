-- P9-T9: match_payments read every unmatched incoming transfer on each sync and ran the full
-- invoice test on each: 5.8s with 16,666 of them. Now it first keeps only the transfers one of
-- its three rules (20260921000300_matching.sql) could fit, using checks every fit needs, so what
-- it matches is unchanged and the work grows with the plausible transfers, not with all of them.
-- Only the loop's list is new; the rest is as before.

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
  partly_paid_names text[];
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the matching engine runs matching' using errcode = 'insufficient_privilege';
  end if;

  -- rule 3's customers, read once (not once per transfer)
  select coalesce(array_agg(distinct lower(c.name)), '{}') into partly_paid_names
    from public.invoices i join public.customers c on c.id = i.customer_id
   where i.status = 'partly_paid';

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
       -- Could a rule fit at all? Each rule needs one of these: (1) the amount is a waiting
       -- bill's amount to transfer, (2) the description has a bill number, (3) it names a
       -- customer with a partly paid bill. The full test is invoice_candidates, below.
       and (t.amount in (select i.transfer_amount from public.invoices i
                          where i.status in ('open', 'partly_paid'))
            or lower(t.description_raw) ~ 'inv[\s\-]*[0-9]'
            or exists (select 1 from unnest(partly_paid_names) n
                        where strpos(lower(t.description_raw), n) > 0))
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
