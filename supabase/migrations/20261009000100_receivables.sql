-- P8-T2: what customers owed on any day — the base of aging, DSO, CEI and bucket migration
-- (UPGRADE-v2 §4.2). Comparing with a month ago needs the past, so every number here is "as of"
-- the end of a Jakarta day.

-- 1. When a bill was cancelled. Set by the database on the change to 'void' (every path: the
-- cancel button, the e2e tidy-up, tests); older ones from the audit log, else when written.
alter table public.invoices add column voided_at timestamptz;

update public.invoices i
   set voided_at = coalesce(
         (select min(a.created_at) from public.audit_log a
           where a.table_name = 'invoices' and a.record_id = i.id::text
             and a.new_value ->> 'status' = 'void'),
         i.created_at)
 where i.status = 'void';

alter table public.invoices
  add constraint invoices_voided_at_check check ((status = 'void') = (voided_at is not null));

create or replace function public.stamp_invoice_void()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.voided_at := case when new.status = 'void' then coalesce(old.voided_at, now()) end;
  return new;
end;
$$;

revoke all on function public.stamp_invoice_void() from public, anon;

create trigger invoices_stamp_void before update of status on public.invoices
  for each row execute function public.stamp_invoice_void();

-- 2. What each bill still owed at the end of p_on. Billed = base_amount (the unique code is only
-- ever part of the transfer that finishes a bill, never owed before it); paid = payments whose
-- money had arrived by then (the bank's date; a "marked paid" one: when it was marked).
-- A bill counts from the day it was written until the day it was cancelled. Read with the
-- person's own permissions (RLS).
create function public.invoice_owed_on(p_on date)
returns table (invoice_id uuid, customer_id uuid, due_on date, owed bigint)
language sql
stable
set search_path = ''
as $$
  select i.id, i.customer_id, i.due_on, x.owed
    from public.invoices i
    cross join lateral (
      select greatest(i.base_amount - coalesce(sum(p.amount_applied), 0), 0)::bigint as owed
        from public.payments p
        left join public.bank_transactions t on t.id = p.bank_transaction_id
       where p.invoice_id = i.id
         and (coalesce(t.occurred_at, p.created_at) at time zone 'Asia/Jakarta')::date <= p_on
    ) x
   where i.issued_on <= p_on
     and (i.voided_at is null or (i.voided_at at time zone 'Asia/Jakarta')::date > p_on)
     and x.owed > 0;
$$;

revoke all on function public.invoice_owed_on(date) from public, anon;
grant execute on function public.invoice_owed_on(date) to authenticated, service_role;

-- 3. Aging bucket of a bill on a day: 0 not yet due (due today counts as not yet due, as
-- everywhere else), 1 = 1–30 days late, 2 = 31–60, 3 = 61–90, 4 = more than 90.
create function public.aging_bucket(p_due date, p_on date)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_on - p_due <= 0 then 0
              when p_on - p_due <= 30 then 1
              when p_on - p_due <= 60 then 2
              when p_on - p_due <= 90 then 3
              else 4 end;
$$;

revoke all on function public.aging_bucket(date, date) from public, anon;
grant execute on function public.aging_bucket(date, date) to authenticated, service_role;

-- 4. The raw sums the receivables metrics are worked out from (the ratios are in lib/metrics.ts).
create function public.receivables_summary(p_on date default public.jakarta_today())
returns table (
  aging bigint[],           -- owed on p_on per bucket: not due, 1–30, 31–60, 61–90, 90+
  sales_90 bigint,          -- billed in the 90 days to p_on, not cancelled by then (DSO)
  begin_30 bigint,          -- CEI over the 30 days to p_on: owed the day before they start,
  sales_30 bigint,          --   billed during them,
  voided_30 bigint,         --   still owed on bills cancelled during them (not collected),
  migrated_from bigint[],   -- bucket migration, 30 days ago → p_on: owed then in buckets 0–3,
  migrated_to bigint[]      --   and what of those same bills sits one bucket later on p_on
)
language sql
stable
set search_path = ''
as $$
  with now_owed as (select * from public.invoice_owed_on(p_on)),
  then_owed as (select * from public.invoice_owed_on(p_on - 30)),
  voided as (
    -- what a bill still owed on the day it was cancelled
    select x.owed
      from public.invoices i
      cross join lateral (
        select greatest(i.base_amount - coalesce(sum(p.amount_applied), 0), 0) as owed
          from public.payments p
          left join public.bank_transactions t on t.id = p.bank_transaction_id
         where p.invoice_id = i.id
           and (coalesce(t.occurred_at, p.created_at) at time zone 'Asia/Jakarta')::date
               <= (i.voided_at at time zone 'Asia/Jakarta')::date
      ) x
     where (i.voided_at at time zone 'Asia/Jakarta')::date between p_on - 29 and p_on
  )
  select
    (select array_agg(coalesce(s, 0) order by b)
       from generate_series(0, 4) b
       left join (select public.aging_bucket(due_on, p_on) as k, sum(owed) as s
                    from now_owed group by 1) a on a.k = b),
    (select coalesce(sum(i.base_amount), 0) from public.invoices i
      where i.issued_on between p_on - 89 and p_on
        and (i.voided_at is null or (i.voided_at at time zone 'Asia/Jakarta')::date > p_on))::bigint,
    (select coalesce(sum(owed), 0) from then_owed)::bigint,
    (select coalesce(sum(i.base_amount), 0) from public.invoices i
      where i.issued_on between p_on - 29 and p_on)::bigint,
    (select coalesce(sum(owed), 0) from voided)::bigint,
    (select array_agg(coalesce(s, 0) order by b)
       from generate_series(0, 3) b
       left join (select public.aging_bucket(due_on, p_on - 30) as k, sum(owed) as s
                    from then_owed group by 1) a on a.k = b),
    (select array_agg(coalesce(s, 0) order by b)
       from generate_series(0, 3) b
       left join (select public.aging_bucket(t.due_on, p_on - 30) as k, sum(n.owed) as s
                    from then_owed t
                    join now_owed n on n.invoice_id = t.invoice_id
                   where public.aging_bucket(n.due_on, p_on) = public.aging_bucket(t.due_on, p_on - 30) + 1
                   group by 1) a on a.k = b);
$$;

revoke all on function public.receivables_summary(date) from public, anon;
grant execute on function public.receivables_summary(date) to authenticated, service_role;

-- 5. The 10 bills most overdue by amount, with how late and when someone last reminded.
create function public.top_overdue(p_on date default public.jakarta_today(), p_limit int default 10)
returns table (
  invoice_id uuid, number text, customer_id uuid, customer text,
  owed bigint, days_late int, last_reminded timestamptz
)
language sql
stable
set search_path = ''
as $$
  select o.invoice_id, i.number, o.customer_id, c.name, o.owed, p_on - o.due_on,
         (select max(r.sent_at) from public.reminders r where r.invoice_id = o.invoice_id)
    from public.invoice_owed_on(p_on) o
    join public.invoices i on i.id = o.invoice_id
    join public.customers c on c.id = o.customer_id
   where o.due_on < p_on
   order by o.owed desc, o.due_on, i.number
   limit p_limit;
$$;

revoke all on function public.top_overdue(date, int) from public, anon;
grant execute on function public.top_overdue(date, int) to authenticated, service_role;

-- 6. Limits for the receivables metrics (the owner changes them on Settings → Health limits).
alter table public.health_thresholds drop constraint health_thresholds_signal_check;
alter table public.health_thresholds add constraint health_thresholds_signal_check
  check (signal in ('runway', 'net_cashflow', 'late_share', 'renewal_rate', 'top_customer_share',
                    'forecast_low', 'forecast_off',
                    'overdue_share', 'over_90_share', 'dso', 'cei'));

insert into public.health_thresholds (signal, healthy_limit, warning_limit, direction) values
  ('overdue_share', 10, 15, 'lower_is_better'),   -- % of what is owed that is past due
  ('over_90_share', 20, 25, 'lower_is_better'),   -- % of what is owed that is 90+ days late
  ('dso',           45, 60, 'lower_is_better'),   -- days customers take to pay (SaaS: 30–45)
  ('cei',           85, 75, 'higher_is_better');  -- % collected of what was collectible (85–95)
