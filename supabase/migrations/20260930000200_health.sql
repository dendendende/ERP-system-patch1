-- P4-T3: five health signals, each healthy / warning / danger against limits the owner can change
-- (P4-T6). A daily snapshot keeps the value, status and one plain sentence; changing a limit only
-- affects snapshots taken after it. Overall status = the worst signal (worked out when read).

create table public.health_thresholds (
  signal text primary key
    check (signal in ('runway', 'net_cashflow', 'late_share', 'renewal_rate', 'top_customer_share')),
  healthy_limit numeric not null,
  warning_limit numeric,       -- null for net_cashflow: its danger is "negative 3 months running"
  direction text not null check (direction in ('higher_is_better', 'lower_is_better')),
  check ((signal = 'net_cashflow') = (warning_limit is null)),
  check (warning_limit is null or case direction
           when 'higher_is_better' then warning_limit <= healthy_limit
           else warning_limit >= healthy_limit end)
);

insert into public.health_thresholds (signal, healthy_limit, warning_limit, direction) values
  ('runway',             12,   6,    'higher_is_better'),  -- months
  ('net_cashflow',       0,    null, 'higher_is_better'),  -- rupiah a month, 3-month average
  ('late_share',         10,   25,   'lower_is_better'),   -- % of what is owed, > 30 days late
  ('renewal_rate',       90,   80,   'higher_is_better'),  -- %, last 12 months
  ('top_customer_share', 20,   35,   'lower_is_better');   -- %, of the last 12 months' income

create table public.health_snapshots (
  taken_on date not null,
  signal text not null references public.health_thresholds (signal),
  value numeric,                -- null = not enough data yet
  status text not null check (status in ('healthy', 'warning', 'danger')),
  explanation text not null,
  primary key (taken_on, signal)
);

alter table public.health_thresholds enable row level security;
alter table public.health_snapshots enable row level security;
revoke all on public.health_thresholds, public.health_snapshots from anon, authenticated;
grant select, update (healthy_limit, warning_limit) on public.health_thresholds to authenticated;
grant select on public.health_snapshots to authenticated;
create policy health_thresholds_select on public.health_thresholds
  for select to authenticated using (public.current_app_role() is not null);
create policy health_thresholds_owner_update on public.health_thresholds
  for update to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');
create policy health_snapshots_select on public.health_snapshots
  for select to authenticated using (public.current_app_role() is not null);
select public.enable_audit('public.health_thresholds');

-- The boundary rule, in one place: strictly past the healthy limit is healthy, up to and
-- including the warning limit is warning, beyond it is danger.
create or replace function public.health_status(p_value numeric, p_signal text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_value is null then 'healthy'
    when t.direction = 'higher_is_better' then
      case when p_value > t.healthy_limit then 'healthy'
           when p_value >= t.warning_limit then 'warning' else 'danger' end
    else
      case when p_value < t.healthy_limit then 'healthy'
           when p_value <= t.warning_limit then 'warning' else 'danger' end
  end
  from public.health_thresholds t where t.signal = p_signal;
$$;

grant execute on function public.health_status(numeric, text) to authenticated, service_role;

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

  -- 4. renewals in the last 12 months: subscription bills paid vs. cancelled or 30+ days unpaid
  select count(*) filter (where i.status = 'paid'),
         count(*) filter (where i.status = 'void' or (i.status in ('open', 'partly_paid') and i.due_on < p_on - 30))
    into renewed, lost
    from public.invoices i
   where i.subscription_id is not null and i.due_on between p_on - 365 and p_on;
  renewal := case when renewed + lost > 0 then round(100.0 * renewed / (renewed + lost), 1) end;

  -- 5. biggest customer's share of the last 12 months' income from bills (money that came in)
  select round(100.0 * max(total) / nullif(sum(total), 0), 1),
         (array_agg(name order by total desc))[1]
    into top_share, top_name
    from (select c.name, sum(p.amount_applied) as total
            from public.payments p
            join public.invoices i on i.id = p.invoice_id
            join public.customers c on c.id = i.customer_id
           where p.method <> 'no_transfer' and p.created_at >= (p_on - 365)::timestamptz
           group by c.name) per_customer;

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
