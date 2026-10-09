-- P8-T3a: MRR / ARR, and what was added and lost this month (UPGRADE-v2 §4.3).
-- MRR a month ago needs each subscription as it was then: the audit log has its full first row
-- and every change since, so it is replayed. Before a subscription was entered, it is taken as
-- first entered (a customer added during setup with an older start date counted from that date).

-- 1. Each subscription as it stood at the end of a Jakarta day. Reads the audit log, which only
-- the owner may open, so it runs as its owner — and answers only signed-in people and the jobs.
create function public.subscription_state_on(p_on date)
returns table (
  subscription_id uuid, customer_id uuid, plan_name text, price bigint, cycle text,
  is_active boolean   -- running that day: status active, started, not yet ended
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.customer_id, v.plan_name, v.price, v.cycle,
         v.status = 'active' and v.start_date <= p_on and (v.end_date is null or v.end_date >= p_on)
    from public.subscriptions s
    cross join lateral (
      -- per column: the last change by the end of p_on, else the first row entered
      select jsonb_object_agg(x.key, x.value) as h
        from (select distinct on (e.key) e.key, e.value
                from public.audit_log a
                cross join lateral jsonb_each(a.new_value) e
               where a.table_name = 'subscriptions' and a.record_id = s.id::text
                 and (a.created_at < ((p_on + 1)::timestamp at time zone 'Asia/Jakarta')
                      or a.action = 'insert')
               order by e.key,
                        a.created_at < ((p_on + 1)::timestamp at time zone 'Asia/Jakarta') desc,
                        a.id desc) x
    ) l
    -- a column the log doesn't have (it always should) falls back to today's value
    cross join lateral (
      select case when l.h ? 'plan_name' then l.h ->> 'plan_name' else s.plan_name end as plan_name,
             case when l.h ? 'price' then (l.h ->> 'price')::bigint else s.price end as price,
             case when l.h ? 'cycle' then l.h ->> 'cycle' else s.cycle end as cycle,
             case when l.h ? 'status' then l.h ->> 'status' else s.status end as status,
             case when l.h ? 'start_date' then (l.h ->> 'start_date')::date else s.start_date end as start_date,
             case when l.h ? 'end_date' then (l.h ->> 'end_date')::date else s.end_date end as end_date
    ) v
   where public.current_app_role() is not null or current_setting('role') = 'service_role';
$$;

revoke all on function public.subscription_state_on(date) from public, anon;
grant execute on function public.subscription_state_on(date) to authenticated, service_role;

-- 2. A subscription's yearly value: the price times its cycles in a year. Exact in whole rupiah
-- (MRR = ARR ÷ 12 is rounded once, for display, in lib/metrics.ts).
create function public.yearly_value(p_price bigint, p_cycle text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select p_price * case p_cycle when 'monthly' then 12 when 'quarterly' then 4 else 1 end;
$$;

revoke all on function public.yearly_value(bigint, text) from public, anon;
grant execute on function public.yearly_value(bigint, text) to authenticated, service_role;

-- 3. The sums. "This month" = from the end of last month to the end of p_on.
create function public.mrr_summary(p_on date default public.jakarta_today())
returns table (
  arr bigint,          -- yearly value of everything running on p_on
  active int,          -- how many subscriptions that is
  arr_added bigint,    -- this month: new, restarted, or priced up (per subscription)
  arr_lost bigint      -- this month: ended, paused, or priced down
)
language sql
stable
set search_path = ''
as $$
  with now_ as (select * from public.subscription_state_on(p_on)),
  before as (select * from public.subscription_state_on((date_trunc('month', p_on) - interval '1 day')::date)),
  per as (
    select coalesce(case when n.is_active then public.yearly_value(n.price, n.cycle) end, 0) as now_v,
           coalesce(case when b.is_active then public.yearly_value(b.price, b.cycle) end, 0) as before_v,
           coalesce(n.is_active, false) as running
      from now_ n full join before b using (subscription_id)
  )
  select coalesce(sum(now_v), 0)::bigint,
         count(*) filter (where running)::int,
         coalesce(sum(greatest(now_v - before_v, 0)), 0)::bigint,
         coalesce(sum(greatest(before_v - now_v, 0)), 0)::bigint
    from per;
$$;

revoke all on function public.mrr_summary(date) from public, anon;
grant execute on function public.mrr_summary(date) to authenticated, service_role;
