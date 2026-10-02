-- P5-T2: how many days late each customer usually pays — the forecast moves their money by it.
-- Per paid bill: the day the last payment came in (bank date when there was a transfer) minus
-- the due date, never below 0 (early counts as on time). Averaged over the customer's paid bills.
-- Customers with no paid bill yet don't appear (the forecast treats them as on time).

create or replace view public.customer_payment_delay with (security_invoker = true) as
  select i.customer_id,
         round(avg(greatest(paid.day - i.due_on, 0)), 1) as avg_delay_days,
         count(*)::int as paid_bills
    from public.invoices i
    join lateral (
      select max((coalesce(t.occurred_at, p.created_at) at time zone 'Asia/Jakarta')::date) as day
        from public.payments p
        left join public.bank_transactions t on t.id = p.bank_transaction_id
       where p.invoice_id = i.id
    ) paid on true
   where i.status = 'paid'
   group by i.customer_id;

grant select on public.customer_payment_delay to authenticated;
