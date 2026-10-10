-- P8-T9: the bills list can show what the health check's "late" counts: bills owed more than 30
-- days past due (the same bills as late_share in take_health_snapshot). Otherwise unchanged.

create or replace function public.bill_list(
  p_status text default null,   -- 'waiting' | 'late' | 'late_30' (more than 30 days) | 'paid' | 'void'
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
         or (p_status = 'late_30' and b.owed > 0 and b.days_late > 30)
         or (p_status = 'paid' and b.status = 'paid')
         or (p_status = 'void' and b.status = 'void'))
    and (p_bucket is null or b.bucket = p_bucket);
$$;
