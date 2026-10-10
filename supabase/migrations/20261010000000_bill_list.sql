-- P8-T8a: the bills list. Like money_list: one SQL definition of the filters that the list, its
-- totals, its charts and its CSV all read, with the reader's own permissions (RLS).
-- "Still owed" is invoice_owed_on(today) — the same number the receivables metrics add up, so
-- a cue and the list it opens always agree.

create function public.bill_list(
  p_status text default null,   -- 'waiting' (still owed) | 'late' (owed, past due) | 'paid' | 'void'
  p_bucket int default null,    -- aging bucket of what is still owed: 0 not due … 4 over 90 days
  p_customer uuid default null,
  p_from date default null,     -- due between
  p_to date default null,
  p_q text default null,        -- bill number or customer name
  p_on date default public.jakarta_today()
)
returns table (
  id uuid,
  number text,
  customer_id uuid,
  customer text,
  status text,
  issued_on date,
  due_on date,
  billed bigint,      -- the bill (base amount; the unique code is never owed)
  paid bigint,        -- every payment on it so far
  owed bigint,        -- still owed today (0 when paid or cancelled)
  days_late int,      -- 0 unless owed and past due
  bucket int          -- null unless owed
)
language sql
stable
set search_path = ''
as $$
  select * from (
    select i.id, i.number, i.customer_id, c.name, i.status, i.issued_on, i.due_on, i.base_amount,
           coalesce((select sum(p.amount_applied) from public.payments p where p.invoice_id = i.id), 0)::bigint,
           coalesce(o.owed, 0),
           case when o.owed > 0 then greatest(p_on - i.due_on, 0) else 0 end,
           case when o.owed > 0 then public.aging_bucket(i.due_on, p_on) end
      from public.invoices i
      join public.customers c on c.id = i.customer_id
      left join public.invoice_owed_on(p_on) o on o.invoice_id = i.id
     where (p_customer is null or i.customer_id = p_customer)
       and (p_from is null or i.due_on >= p_from)
       and (p_to is null or i.due_on <= p_to)
       and (p_q is null or i.number ilike '%' || p_q || '%' or c.name ilike '%' || p_q || '%')
  ) b (id, number, customer_id, customer, status, issued_on, due_on, billed, paid, owed, days_late, bucket)
  where (p_status is null
         or (p_status = 'waiting' and b.owed > 0)
         or (p_status = 'late' and b.owed > 0 and b.days_late > 0)
         or (p_status = 'paid' and b.status = 'paid')
         or (p_status = 'void' and b.status = 'void'))
    and (p_bucket is null or b.bucket = p_bucket);
$$;

-- Totals and chart data for the same filtered bills. Amounts as text: exact above 2^53.
create function public.bill_list_summary(
  p_status text default null,
  p_bucket int default null,
  p_customer uuid default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_on date default public.jakarta_today()
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with b as (
    select * from public.bill_list(p_status, p_bucket, p_customer, p_from, p_to, p_q, p_on)
  ),
  counted as (select * from b where status <> 'void')
  select jsonb_build_object(
    'count', (select count(*) from b),
    -- cancelled bills are listed but not billed
    'billed', (select coalesce(sum(billed), 0)::text from counted),
    'paid', (select coalesce(sum(paid), 0)::text from counted),
    'owed', (select coalesce(sum(owed), 0)::text from b),
    'past_due', (select coalesce(sum(owed) filter (where days_late > 0), 0)::text from b),
    -- what is still owed, by how late: every bucket, in order, even when empty
    'aging', (
      select jsonb_agg(jsonb_build_object('bucket', k, 'owed', coalesce(s.owed, 0)::text,
                                          'count', coalesce(s.n, 0)) order by k)
        from generate_series(0, 4) k
        left join (select bucket, sum(owed) as owed, count(*) as n
                     from b where bucket is not null group by bucket) s on s.bucket = k
    ),
    -- who owes the most: the 6 biggest
    'by_customer', coalesce((
      select jsonb_agg(jsonb_build_object('customer_id', t.customer_id, 'customer', t.customer,
                                          'owed', t.owed::text) order by t.owed desc)
        from (select customer_id, customer, sum(owed) as owed
                from b where owed > 0 group by 1, 2 order by 3 desc limit 6) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.bill_list(text, int, uuid, date, date, text, date) from public, anon;
revoke all on function public.bill_list_summary(text, int, uuid, date, date, text, date) from public, anon;
grant execute on function public.bill_list(text, int, uuid, date, date, text, date) to authenticated;
grant execute on function public.bill_list_summary(text, int, uuid, date, date, text, date) to authenticated;
