-- P1-T6b: detect transfers between our own bank accounts.
--
-- Money out of one own account + the same amount into another own account, within one day
-- (Asia/Jakarta dates) = moving our own money, not income or spending. Both sides get the
-- "Transfer between own accounts" category (report_group 'transfer'), which reports exclude
-- from came-in / went-out totals.
--   • beats rules (a payroll top-up is a transfer, even if a rule says "Salary")
--   • never overrides a label a person set (status 'labelled')
--   • each transaction pairs at most once; the closest in time wins

create index bank_transactions_amount_idx on public.bank_transactions (amount);

create or replace function public.create_entry_for_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rules;
  pair_entry uuid;
begin
  r := public.match_rule(new.direction, new.description_raw);
  insert into public.entries (bank_transaction_id, category_id, is_recurring, status, rule_id)
  values (
    new.id,
    r.category_id,
    coalesce(r.is_recurring, false),
    case when r.id is null then 'needs_label' else 'auto' end,
    r.id
  );

  select e.id into pair_entry
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    left join public.categories c on c.id = e.category_id
   where t.bank_account_id <> new.bank_account_id
     and t.direction <> new.direction
     and t.amount = new.amount
     and abs((t.occurred_at at time zone 'Asia/Jakarta')::date
             - (new.occurred_at at time zone 'Asia/Jakarta')::date) <= 1
     and e.status <> 'labelled'
     and c.report_group is distinct from 'transfer'
   order by abs(extract(epoch from t.occurred_at - new.occurred_at)), t.created_at
   limit 1
   for update of e skip locked;

  if pair_entry is not null then
    update public.entries e
       set category_id = c.id, status = 'auto', is_recurring = false, rule_id = null
      from public.bank_transactions t, public.categories c
     where t.id = e.bank_transaction_id
       and (e.id = pair_entry or e.bank_transaction_id = new.id)
       and c.is_system and c.report_group = 'transfer' and c.type = t.direction;
  end if;

  return null;
end;
$$;
