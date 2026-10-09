-- P8-T3b: renewal rate, renewals due, revenue by plan and by customer, concentration
-- (UPGRADE-v2 §4.3, §4.2). The renewal rate and the biggest customer's share were worked out
-- inside the daily health check; they move into functions both the check and the metrics read,
-- so the two can never disagree. All "as of" the end of a Jakarta day.

-- 1. Subscription bills due in the 12 months to p_on: paid in full by then (renewed), or
-- cancelled by then / still unpaid 30+ days after their due date (lost). Others are undecided.
-- Today it gives what the health check always gave (status paid / void / open 30+ days late).
create function public.renewal_counts(p_on date default public.jakarta_today())
returns table (renewed int, lost int)
language sql
stable
set search_path = ''
as $$
  select (count(*) filter (where o.invoice_id is null and not v.cancelled))::int,
         (count(*) filter (where v.cancelled or o.due_on < p_on - 30))::int
    from public.invoices i
    left join public.invoice_owed_on(p_on) o on o.invoice_id = i.id
    cross join lateral (
      select coalesce((i.voided_at at time zone 'Asia/Jakarta')::date <= p_on, false) as cancelled
    ) v
   where i.subscription_id is not null and i.due_on between p_on - 365 and p_on;
$$;

revoke all on function public.renewal_counts(date) from public, anon;
grant execute on function public.renewal_counts(date) to authenticated, service_role;

-- 2. Income from bills in the 365 days to p_on, by customer: money that came through the bank
-- (dated by the bank; "marked paid" without a transfer is left out). Biggest first.
-- (The health check used to group by customer name and date by when a payment was matched.)
create function public.revenue_by_customer(p_on date default public.jakarta_today())
returns table (customer_id uuid, customer text, total bigint)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, sum(p.amount_applied)::bigint
    from public.payments p
    join public.bank_transactions t on t.id = p.bank_transaction_id
    join public.invoices i on i.id = p.invoice_id
    join public.customers c on c.id = i.customer_id
   where (t.occurred_at at time zone 'Asia/Jakarta')::date between p_on - 364 and p_on
   group by c.id, c.name
   order by 3 desc, 2;
$$;

revoke all on function public.revenue_by_customer(date) from public, anon;
grant execute on function public.revenue_by_customer(date) to authenticated, service_role;

-- 3. The same income by plan (the subscription's plan name; null = bills not from a subscription).
create function public.revenue_by_plan(p_on date default public.jakarta_today())
returns table (plan text, total bigint)
language sql
stable
set search_path = ''
as $$
  select s.plan_name, sum(p.amount_applied)::bigint
    from public.payments p
    join public.bank_transactions t on t.id = p.bank_transaction_id
    join public.invoices i on i.id = p.invoice_id
    left join public.subscriptions s on s.id = i.subscription_id
   where (t.occurred_at at time zone 'Asia/Jakarta')::date between p_on - 364 and p_on
   group by s.plan_name
   order by 2 desc, 1;
$$;

revoke all on function public.revenue_by_plan(date) from public, anon;
grant execute on function public.revenue_by_plan(date) to authenticated, service_role;

-- 4. The daily health check, unchanged except steps 4 and 5.
create or replace function public.take_health_snapshot(p_on date default public.jakarta_today())
returns setof public.health_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  runway numeric;
  nets bigint[];
  net_avg numeric;
  late numeric;
  renewed int;
  lost int;
  renewal numeric;
  top_share numeric;
  top_name text;
  rp text;
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the daily job takes health snapshots' using errcode = 'insufficient_privilege';
  end if;

  select * into s from public.money_summary(p_on);

  -- 1. runway: months the cash lasts at the usual regular costs
  runway := case when s.recurring_spending > 0
                 then round(s.cash_in_bank::numeric / s.recurring_spending, 1) end;

  -- 2. net cashflow per full month, last 3 months (own transfers excluded)
  select array_agg(coalesce(net, 0) order by m) into nets
    from generate_series(1, 3) as m
    left join lateral (
      select sum(case when t.direction = 'in' then t.amount else -t.amount end) as net
        from public.bank_transactions t
        join public.entries e on e.bank_transaction_id = t.id
        join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
        left join public.categories c on c.id = e.category_id
       where c.report_group is distinct from 'transfer'
         and (t.occurred_at at time zone 'Asia/Jakarta')::date
             >= (date_trunc('month', p_on) - make_interval(months => m))::date
         and (t.occurred_at at time zone 'Asia/Jakarta')::date
             < (date_trunc('month', p_on) - make_interval(months => m - 1))::date
    ) x on true;
  net_avg := round((nets[1] + nets[2] + nets[3])::numeric / 3);

  -- 3. share of what is owed that is more than 30 days late
  select case when s.still_owed > 0 then round(100.0 * coalesce(sum(greatest(i.amount_due - public.invoice_paid(i.id), 0)), 0) / s.still_owed, 1) else 0 end
    into late
    from public.invoices i
   where i.status in ('open', 'partly_paid') and i.due_on < p_on - 30;

  -- 4. renewals in the last 12 months (renewal_counts: the renewal-rate metric reads the same)
  select r.renewed, r.lost into renewed, lost from public.renewal_counts(p_on) r;
  renewal := case when renewed + lost > 0 then round(100.0 * renewed / (renewed + lost), 1) end;

  -- 5. biggest customer's share of the last 12 months' income from bills (revenue_by_customer:
  -- the concentration metric reads the same)
  select round(100.0 * max(r.total) / nullif(sum(r.total), 0), 1),
         (array_agg(r.customer order by r.total desc, r.customer))[1]
    into top_share, top_name
    from public.revenue_by_customer(p_on) r;

  rp := 'Rp ' || replace(to_char(abs(net_avg), 'FM999,999,999,999,999'), ',', '.');

  insert into public.health_snapshots (taken_on, signal, value, status, explanation)
  values
    (p_on, 'runway', runway, public.health_status(runway, 'runway'),
     case when runway is null then 'No regular monthly costs recorded yet, so there is nothing to run out against.'
          else format('At your usual regular costs, the cash in the bank lasts about %s months.', runway) end),
    (p_on, 'net_cashflow', net_avg,
     case when net_avg > (select healthy_limit from public.health_thresholds where signal = 'net_cashflow') then 'healthy'
          when nets[1] < 0 and nets[2] < 0 and nets[3] < 0 then 'danger'
          else 'warning' end,
     case when net_avg >= 0
          then format('Over the last 3 months, about %s more came in than went out each month.', rp)
          else format('Over the last 3 months, about %s more went out than came in each month%s.', rp,
                      case when nets[1] < 0 and nets[2] < 0 and nets[3] < 0 then ' — every one of them' else '' end) end),
    (p_on, 'late_share', late, public.health_status(late, 'late_share'),
     format('%s%% of what customers owe is more than 30 days late.', late)),
    (p_on, 'renewal_rate', renewal, public.health_status(renewal, 'renewal_rate'),
     case when renewal is null then 'No subscription has come up for renewal yet.'
          else format('%s of %s subscription renewals in the last 12 months were paid (%s%%).', renewed, renewed + lost, renewal) end),
    (p_on, 'top_customer_share', top_share, public.health_status(top_share, 'top_customer_share'),
     case when top_share is null then 'No payments from customers in the last 12 months yet.'
          else format('%s brought in %s%% of the last 12 months'' income from bills.', top_name, top_share) end)
  on conflict (taken_on, signal) do update
    set value = excluded.value, status = excluded.status, explanation = excluded.explanation;

  return query select * from public.health_snapshots where taken_on = p_on;
end;
$$;

revoke all on function public.take_health_snapshot(date) from public, anon, authenticated;
grant execute on function public.take_health_snapshot(date) to service_role;


-- 5. The renewal pipeline looks 90 days ahead (was 60) for "renewals due in 30 / 60 / 90 days".
-- The Renewals screen still shows 30 or 60. Otherwise unchanged from 20261002000200.
create or replace view public.renewal_pipeline with (security_invoker = true) as
  select s.id as subscription_id,
         c.id as customer_id,
         c.name as customer_name,
         s.plan_name,
         s.price,
         s.next_invoice_date as renews_on,
         (s.next_invoice_date - public.jakarta_today()) as days_until,
         coalesce((
           select max((coalesce(t.occurred_at, p.created_at) at time zone 'Asia/Jakarta')::date) > i.due_on
             from public.payments p
             left join public.bank_transactions t on t.id = p.bank_transaction_id
            where p.invoice_id = i.id
         ), false) as paid_late_last_cycle,
         exists (select 1 from public.reminders_to_send r
                  where r.customer_id = c.id and r.template_key is distinct from 'thank_you') as reminders_waiting,
         exists (
           select 1 from public.invoices pi
            where pi.customer_id = c.id and pi.issued_on >= public.jakarta_today() - 365
              and (select count(*) from public.payments p where p.invoice_id = pi.id) > 1
         ) as partial_payments,
         (c.reminders_paused or exists (
           select 1 from public.audit_log a
            where a.table_name = 'subscriptions' and a.record_id = s.id::text and a.action = 'update'
              and a.new_value ->> 'status' = 'paused' and a.created_at >= now() - interval '90 days'
         )) as recently_paused,
         (select o.id from public.invoices o
           where o.subscription_id = s.id and o.status in ('open', 'partly_paid')
           order by o.due_on limit 1) as open_invoice_id
    from public.subscriptions s
    join public.customers c on c.id = s.customer_id
    left join lateral (
      select pi.id, pi.due_on from public.invoices pi
       where pi.subscription_id = s.id and pi.status = 'paid'
       order by pi.due_on desc limit 1
    ) i on true
   where s.status = 'active'
     and s.next_invoice_date between public.jakarta_today() and public.jakarta_today() + 90;
