-- P8-T4: spending analytics (UPGRADE-v2 §4.4). Money out on active accounts, own transfers (and
-- cancelled hand entries, in the same group) left out — like every other total. Jakarta months.

-- 1. Money out this month (to p_on) and in the 3 full months before it, by category and by
-- regular vs one-off. One row per (category, regular); the app adds them up both ways. The
-- 3 months are a total: the app divides by 3 itself, so "30% above usual" is compared exactly.
create function public.spending_summary(p_on date default public.jakarta_today())
returns table (
  category_id uuid,       -- null = still needs a label
  category text,
  is_recurring boolean,
  this_month bigint,
  last_3_months bigint
)
language sql
stable
set search_path = ''
as $$
  with m as (
    select date_trunc('month', p_on)::date as this_start,
           (date_trunc('month', p_on) - interval '3 months')::date as prev_start
  )
  select c.id, c.name, e.is_recurring,
         coalesce(sum(t.amount) filter (where x.day >= m.this_start), 0)::bigint,
         coalesce(sum(t.amount) filter (where x.day < m.this_start), 0)::bigint
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
    left join public.categories c on c.id = e.category_id
    cross join m
    cross join lateral (select (t.occurred_at at time zone 'Asia/Jakarta')::date as day) x
   where t.direction = 'out'
     and c.report_group is distinct from 'transfer'
     and x.day >= m.prev_start and x.day <= p_on
   group by c.id, c.name, e.is_recurring;
$$;

revoke all on function public.spending_summary(date) from public, anon;
grant execute on function public.spending_summary(date) to authenticated, service_role;

-- 2. Who the money went to this month, biggest first: the name typed in "who" when there is one,
-- otherwise the bank's description (banks rarely send a clean name).
create function public.top_payees(p_on date default public.jakarta_today(), p_limit int default 10)
returns table (payee text, named boolean, total bigint, payments int)
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(btrim(e.counterparty), ''), t.description_raw),
         btrim(e.counterparty) <> '',
         sum(t.amount)::bigint,
         count(*)::int
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
    left join public.categories c on c.id = e.category_id
   where t.direction = 'out'
     and c.report_group is distinct from 'transfer'
     and (t.occurred_at at time zone 'Asia/Jakarta')::date between date_trunc('month', p_on)::date and p_on
   group by 1, 2
   order by 3 desc, 1
   limit p_limit;
$$;

revoke all on function public.top_payees(date, int) from public, anon;
grant execute on function public.top_payees(date, int) to authenticated, service_role;

-- 3. "A category is more than X% above its usual month": X is the owner's (default 30).
alter table public.health_thresholds drop constraint health_thresholds_signal_check;
alter table public.health_thresholds add constraint health_thresholds_signal_check
  check (signal in ('runway', 'net_cashflow', 'late_share', 'renewal_rate', 'top_customer_share',
                    'forecast_low', 'forecast_off',
                    'overdue_share', 'over_90_share', 'dso', 'cei',
                    'spend_jump'));

insert into public.health_thresholds (signal, healthy_limit, warning_limit, direction) values
  ('spend_jump', 30, 60, 'lower_is_better');  -- % this month is above the 3-month average
