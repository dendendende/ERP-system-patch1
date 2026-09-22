-- P2-T6: one row per customer for the customer list — still owed, next due, where they stand.
--
-- security_invoker: the view reads with the signed-in person's own permissions, so the same
-- row-level security applies as on the tables underneath.

create or replace view public.customer_billing with (security_invoker = true) as
  select c.id,
         c.name,
         c.is_active,
         coalesce(i.still_owed, 0)::bigint as still_owed,
         i.next_due,
         s.renews_on,
         coalesce(i.next_due < public.jakarta_today(), false) as is_late,
         coalesce(s.renews_on <= public.jakarta_today() + 14, false) as is_renewing_soon,
         (s.renews_on is not null and c.is_active) as is_ongoing
    from public.customers c
    left join lateral (
      select sum(v.amount_due - public.invoice_paid(v.id)) as still_owed, min(v.due_on) as next_due
        from public.invoices v
       where v.customer_id = c.id and v.status in ('open', 'partly_paid')
    ) i on true
    left join lateral (
      select min(sub.next_invoice_date) as renews_on
        from public.subscriptions sub
       where sub.customer_id = c.id and sub.status = 'active'
    ) s on true;

grant select on public.customer_billing to authenticated;
