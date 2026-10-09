-- P8-T1: the cash metrics (UPGRADE-v2 §4.1) compare today with a month ago, so every number they
-- read must be "as of" a day.

-- 1. money_summary: the cash in the bank is the latest balance ON OR BEFORE p_today (it used to be
-- the latest balance ever, whatever day was asked). Same answer for today; right for past days.
create or replace function public.money_summary(p_today date default public.jakarta_today())
returns table (
  cash_in_bank bigint,            -- latest known balance up to p_today, summed over active accounts
  accounts_without_balance int,   -- active accounts the bank never told us a balance for (by p_today)
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
               and t.occurred_at < ((p_today + 1)::timestamp at time zone 'Asia/Jakarta')
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

-- 2. money_list: status 'recurring' = marked as a regular cost, so the runway opens the list it
-- was worked out from. Otherwise unchanged from 20261008000400 (same signature: summary keeps working).
create or replace function public.money_list(
  p_from date default null,
  p_to date default null,
  p_direction text default null,  -- 'in' | 'out'
  p_category uuid default null,
  p_status text default null,     -- 'needs_label' | 'labelled' | 'matched' | 'recurring'
  p_account uuid default null,
  p_min bigint default null,      -- whole rupiah, inclusive
  p_max bigint default null,
  p_q text default null           -- part of the description, who, or the note
)
returns table (
  id uuid,
  occurred_at timestamptz,
  day date,
  amount bigint,
  direction text,
  description text,
  account_id uuid,
  account text,
  category_id uuid,
  category text,
  is_own_transfer boolean,
  status text,
  invoice_id uuid,
  invoice_number text,
  counterparty text,
  note text,
  by_hand boolean
)
language sql
stable
set search_path = ''
as $$
  select t.id,
         t.occurred_at,
         (t.occurred_at at time zone 'Asia/Jakarta')::date,
         t.amount,
         t.direction,
         t.description_raw,
         a.id,
         a.bank_name || ' ••' || a.account_last4,
         c.id,
         c.name,
         coalesce(c.report_group = 'transfer', false),
         e.status,
         e.invoice_id,
         i.number,
         e.counterparty,
         e.note,
         t.entered_by is not null
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    join public.bank_accounts a on a.id = t.bank_account_id
    left join public.categories c on c.id = e.category_id
    left join public.invoices i on i.id = e.invoice_id
   where (p_from is null or t.occurred_at >= (p_from::timestamp at time zone 'Asia/Jakarta'))
     and (p_to is null or t.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
     and (p_direction is null or t.direction = p_direction)
     and (p_category is null or e.category_id = p_category)
     and (p_status is null
          or (p_status = 'needs_label' and e.status = 'needs_label')
          or (p_status = 'labelled' and e.status <> 'needs_label')
          or (p_status = 'matched' and e.invoice_id is not null)
          or (p_status = 'recurring' and e.is_recurring))
     and (p_account is null or t.bank_account_id = p_account)
     and (p_min is null or t.amount >= p_min)
     and (p_max is null or t.amount <= p_max)
     and (p_q is null
          or t.description_raw ilike '%' || p_q || '%'
          or e.counterparty ilike '%' || p_q || '%'
          or e.note ilike '%' || p_q || '%');
$$;

-- 3. Two limits the owner sets for the forecast metrics. They are not daily health checks (no
-- snapshot rows), so the Business health screen is unchanged.
alter table public.health_thresholds drop constraint health_thresholds_signal_check;
alter table public.health_thresholds add constraint health_thresholds_signal_check
  check (signal in ('runway', 'net_cashflow', 'late_share', 'renewal_rate', 'top_customer_share',
                    'forecast_low', 'forecast_off'));

insert into public.health_thresholds (signal, healthy_limit, warning_limit, direction) values
  ('forecast_low', 0,  0,  'higher_is_better'),  -- rupiah: lowest forecast balance, next 90 days
  ('forecast_off', 10, 20, 'lower_is_better');   -- %: how far the forecast was off, closed month
