-- Fix: a subscription whose renewal day has already passed (the daily job missed a few days, or
-- it was set up with a past date) made the job write a bill due before the day it was written.
-- The database refuses that, and the refusal stopped the whole run — nobody was billed.
-- Now a bill written after its renewal day is due the day it is written.
create or replace function public.create_due_invoices(p_lead_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  today date := public.jakarta_today();
  next_date date;
  made integer := 0;
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the invoicing job creates invoices automatically'
      using errcode = 'insufficient_privilege';
  end if;

  for s in
    select * from public.subscriptions
     where status = 'active'
       and next_invoice_date <= today + greatest(p_lead_days, 0)
       and (end_date is null or next_invoice_date <= end_date)
     order by next_invoice_date
     for update skip locked
  loop
    perform public.create_invoice(s.customer_id, s.price, today,
                                  greatest(s.next_invoice_date, today), s.id, s.plan_name);
    next_date := s.next_invoice_date + case s.cycle
                                         when 'monthly' then interval '1 month'
                                         when 'quarterly' then interval '3 months'
                                         else interval '1 year'
                                       end;
    update public.subscriptions
       set next_invoice_date = next_date,
           status = case when end_date is not null and next_date > end_date then 'ended'
                         else status end
     where id = s.id;
    made := made + 1;
  end loop;

  return made;
end;
$$;

revoke all on function public.create_due_invoices(integer) from public, anon, authenticated;
grant execute on function public.create_due_invoices(integer) to service_role;
