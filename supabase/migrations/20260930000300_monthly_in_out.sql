-- P4-T4: in vs out per month for Home's chart.
-- money_moves = every real movement of money: active accounts, own transfers left out, dated by
-- the Jakarta day. (money_summary and the health snapshot predate it and keep their own copy.)

create or replace view public.money_moves with (security_invoker = true) as
  select t.id, t.amount, t.direction, e.is_recurring,
         (t.occurred_at at time zone 'Asia/Jakarta')::date as day
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
    left join public.categories c on c.id = e.category_id
   where c.report_group is distinct from 'transfer';

grant select on public.money_moves to authenticated;

-- The last p_months calendar months up to and including this one (this one only up to today).
create or replace function public.monthly_in_out(p_months integer default 6,
                                                 p_today date default public.jakarta_today())
returns table (month date, came_in bigint, went_out bigint)
language sql
stable
set search_path = ''
as $$
  select m::date,
         coalesce(sum(mv.amount) filter (where mv.direction = 'in'), 0)::bigint,
         coalesce(sum(mv.amount) filter (where mv.direction = 'out'), 0)::bigint
    from generate_series(date_trunc('month', p_today) - make_interval(months => greatest(p_months, 1) - 1),
                         date_trunc('month', p_today), interval '1 month') as m
    left join public.money_moves mv
      on mv.day >= m::date and mv.day < (m + interval '1 month')::date and mv.day <= p_today
   group by m
   order by m;
$$;

grant execute on function public.monthly_in_out(integer, date) to authenticated;
