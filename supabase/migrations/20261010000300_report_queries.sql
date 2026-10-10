-- P9-T2: the sums behind three reports. Read with the person's own permissions (RLS); the other
-- reports reuse functions that already exist (money_summary, bill_list, revenue_by_customer).

-- 1. Cashflow by month and category: the money every total counts — active accounts only, own
-- transfers and hand entries cancelled as mistakes left out (report group 'transfer'), Jakarta
-- days. The cashflow statement and spend by category both add these up.
create function public.cashflow_by_month(p_from date, p_to date)
returns table (month date, direction text, category_id uuid, category text, total bigint)
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', (t.occurred_at at time zone 'Asia/Jakarta'))::date,
         t.direction, c.id, c.name, sum(t.amount)::bigint
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
    left join public.categories c on c.id = e.category_id
   where c.report_group is distinct from 'transfer'
     and t.occurred_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
     and t.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')
   group by 1, 2, 3, 4;
$$;

-- 2. A customer's statement: every change to what they owe between two days, in order — a bill
-- written (+), money counted against a bill (−), a bill cancelled (− what it still owed then).
-- It uses invoice_owed_on's rules exactly, so "owed the day before" + these lines = "owed at the
-- end", to the rupiah:
--   · a payment counts on its bank day, and only up to what the bill still owed — the extra
--     digits of a unique transfer amount are never owed, so they never count;
--   · a cancelled bill stops counting on the day it was cancelled (payments after that don't).
create function public.customer_statement(p_customer uuid, p_from date, p_to date)
returns table (day date, kind text, invoice_id uuid, number text, amount bigint)
language sql
stable
set search_path = ''
as $$
  with bills as (
    select i.id, i.number, i.issued_on, i.base_amount,
           (i.voided_at at time zone 'Asia/Jakarta')::date as voided_on
      from public.invoices i
     where i.customer_id = p_customer
  ),
  pays as (
    select p.invoice_id, p.method,
           (coalesce(t.occurred_at, p.created_at) at time zone 'Asia/Jakarta')::date as day,
           p.amount_applied,
           sum(p.amount_applied) over (
             partition by p.invoice_id
             order by coalesce(t.occurred_at, p.created_at), p.id
           ) as paid_so_far
      from public.payments p
      left join public.bank_transactions t on t.id = p.bank_transaction_id
     where p.invoice_id in (select id from bills)
  ),
  events as (
    select b.issued_on as day, 1 as ord, 'bill' as kind, b.id, b.number, b.base_amount as amount
      from bills b
    union all
    -- what of each payment counted against the bill: up to the bill, no further
    select x.day, 2,
           case x.method when 'no_transfer' then 'marked_paid' else 'payment' end,
           b.id, b.number,
           -(least(b.base_amount, x.paid_so_far) - least(b.base_amount, x.paid_so_far - x.amount_applied))
      from pays x
      join bills b on b.id = x.invoice_id
     where b.voided_on is null or x.day <= b.voided_on
    union all
    -- a cancelled bill: what it still owed on the day it was cancelled
    select b.voided_on, 3, 'cancelled', b.id, b.number,
           -greatest(b.base_amount - coalesce((select sum(x.amount_applied) from pays x
                                                where x.invoice_id = b.id and x.day <= b.voided_on), 0), 0)
      from bills b
     where b.voided_on is not null
  )
  select e.day, e.kind, e.id, e.number, e.amount::bigint
    from events e
   where e.day between p_from and p_to and e.amount <> 0
   order by e.day, e.ord, e.number;
$$;

-- 3. Reminder effectiveness: for each kind of message sent between two days (Jakarta), how many
-- went out, and how many of those bills were paid in full within 7 days of the message (paid in
-- full = the bill is paid now; the day = its last payment's bank day). Thank-yous are left out.
create function public.reminder_effectiveness(p_from date, p_to date)
returns table (kind text, sent int, paid_within_7 int, average_days numeric)
language sql
stable
set search_path = ''
as $$
  with sent as (
    select r.invoice_id, coalesce(s.kind, r.template_key, 'reminder') as kind,
           (r.sent_at at time zone 'Asia/Jakarta')::date as day
      from public.reminders r
      left join public.reminder_schedule s on s.id = r.schedule_id
     where r.status in ('sent', 'delivered', 'read')
       and r.sent_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
       and r.sent_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')
       and coalesce(s.kind, r.template_key, '') <> 'thank_you'
  ),
  paid as (
    select p.invoice_id,
           max((coalesce(t.occurred_at, p.created_at) at time zone 'Asia/Jakarta')::date) as day
      from public.payments p
      join public.invoices i on i.id = p.invoice_id and i.status = 'paid'
      left join public.bank_transactions t on t.id = p.bank_transaction_id
     group by p.invoice_id
  )
  select s.kind,
         count(*)::int,
         count(*) filter (where pd.day between s.day and s.day + 7)::int,
         round(avg(pd.day - s.day) filter (where pd.day between s.day and s.day + 7), 1)
    from sent s
    left join paid pd on pd.invoice_id = s.invoice_id
   group by s.kind;
$$;

revoke all on function public.cashflow_by_month(date, date) from public, anon;
revoke all on function public.customer_statement(uuid, date, date) from public, anon;
revoke all on function public.reminder_effectiveness(date, date) from public, anon;
grant execute on function public.cashflow_by_month(date, date) to authenticated;
grant execute on function public.customer_statement(uuid, date, date) to authenticated;
grant execute on function public.reminder_effectiveness(date, date) to authenticated;
