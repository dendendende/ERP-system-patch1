-- P3-T9: past the escalation step (+14 days by default) a bill stops being the customer's inbox's
-- problem and becomes the team's: "Call PT X, 34 days late". Nothing is stored — a bill is on
-- this list exactly while it is that late and still unpaid, and drops off the moment it's paid.
-- Same care as late notices: only once the bank has been read after the escalation day, so
-- nobody phones a customer whose payment arrived this morning.

create or replace view public.team_escalations with (security_invoker = true) as
  select i.id as invoice_id,
         i.number,
         c.id as customer_id,
         c.name as customer_name,
         c.whatsapp_number as phone,
         c.billing_email as email,
         (public.jakarta_today() - i.due_on) as days_late,
         greatest(i.amount_due - public.invoice_paid(i.id), 0)::bigint as still_owed,
         i.due_on
    from public.invoices i
    join public.customers c on c.id = i.customer_id
    cross join lateral (
      select min(s.offset_days) as offset_days
        from public.reminder_schedule s
       where s.kind = 'escalate_team' and s.is_active
    ) step
   where step.offset_days is not null
     and i.status in ('open', 'partly_paid')
     and public.jakarta_today() >= i.due_on + step.offset_days
     and not i.reminders_paused and not c.reminders_paused and c.is_active
     and public.bank_seen_since(public.reminder_time(i.due_on, step.offset_days));

grant select on public.team_escalations to authenticated;
