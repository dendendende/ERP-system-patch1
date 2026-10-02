-- P5-T4: subscriptions renewing in the next 60 days, with what makes each one a risk.
--   paid_late_last_cycle — the last bill of this subscription was paid after its due date
--   reminders_waiting    — reminders for this customer are due but nobody has sent them yet
--                          (stands in for "unread": with sending done by hand, nobody knows
--                          what was read)
--   partial_payments     — the customer paid a bill in parts in the last 12 months
--   recently_paused      — the subscription was paused in the last 90 days, or the customer's
--                          reminders are paused now

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
     and s.next_invoice_date between public.jakarta_today() and public.jakarta_today() + 60;

grant select on public.renewal_pipeline to authenticated;
