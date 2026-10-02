-- P4-T1: the numbers Home is built from, in one call. Months are Jakarta calendar months.
-- Transfers between our own accounts never count as came in / went out.
-- Runway spending = recurring costs only (last 3 full months), so a one-off big purchase doesn't
-- make the business look like it's burning cash.

create or replace function public.money_summary(p_today date default public.jakarta_today())
returns table (
  cash_in_bank bigint,            -- latest known balance, summed over active accounts
  accounts_without_balance int,   -- active accounts the bank never told us a balance for
  came_in bigint,                 -- this month
  went_out bigint,                -- this month
  usual_came_in bigint,           -- average of the 3 full months before this one
  usual_went_out bigint,
  recurring_spending bigint,      -- monthly average, last 3 full months, recurring costs only
  still_owed bigint,
  past_due bigint
)
language sql
stable
set search_path = ''
as $$
  with month as (
    select date_trunc('month', p_today)::date as this_start,
           (date_trunc('month', p_today) - interval '3 months')::date as prev_start
  ),
  money as (
    select t.amount, t.direction, e.is_recurring,
           (t.occurred_at at time zone 'Asia/Jakarta')::date as day
      from public.bank_transactions t
      join public.entries e on e.bank_transaction_id = t.id
      join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
      left join public.categories c on c.id = e.category_id
     where c.report_group is distinct from 'transfer'
  ),
  balances as (
    select a.id,
           (select t.balance_after from public.bank_transactions t
             where t.bank_account_id = a.id and t.balance_after is not null
             order by t.occurred_at desc, t.created_at desc limit 1) as balance
      from public.bank_accounts a where a.is_active
  ),
  owed as (
    select i.due_on, greatest(i.amount_due - public.invoice_paid(i.id), 0) as rest
      from public.invoices i where i.status in ('open', 'partly_paid')
  )
  select
    (select coalesce(sum(balance), 0) from balances)::bigint,
    (select count(*) from balances where balance is null)::int,
    coalesce(sum(m.amount) filter (where m.direction = 'in' and m.day >= mo.this_start and m.day <= p_today), 0)::bigint,
    coalesce(sum(m.amount) filter (where m.direction = 'out' and m.day >= mo.this_start and m.day <= p_today), 0)::bigint,
    (coalesce(sum(m.amount) filter (where m.direction = 'in' and m.day >= mo.prev_start and m.day < mo.this_start), 0) / 3)::bigint,
    (coalesce(sum(m.amount) filter (where m.direction = 'out' and m.day >= mo.prev_start and m.day < mo.this_start), 0) / 3)::bigint,
    (coalesce(sum(m.amount) filter (where m.direction = 'out' and m.is_recurring and m.day >= mo.prev_start and m.day < mo.this_start), 0) / 3)::bigint,
    (select coalesce(sum(rest), 0) from owed)::bigint,
    (select coalesce(sum(rest), 0) from owed where due_on < p_today)::bigint
  from month mo
  left join money m on true
  group by mo.this_start, mo.prev_start;
$$;

grant execute on function public.money_summary(date) to authenticated;
