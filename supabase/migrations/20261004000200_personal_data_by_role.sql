-- P6-T3c: personal data by role (UU PDP: only people who need it see it).
--   Customer phone numbers and emails: owner and operator (they send the reminders and make
--   the calls). Viewers see customers and bills, but not how to contact them.
--   Change history: the owner reads everything. Others read only the history of transaction
--   labels and subscriptions (shown on those screens), which holds no contact details.
--   Team emails were already owner-only (they live in the auth system; Settings → Team).

-- Viewers can't read the two contact columns at all; everyone reads them through this.
create or replace function public.customer_contacts()
returns table (customer_id uuid, whatsapp_number text, billing_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.whatsapp_number, c.billing_email
    from public.customers c
   where public.current_app_role() in ('owner', 'operator');
$$;
revoke all on function public.customer_contacts() from public, anon;
grant execute on function public.customer_contacts() to authenticated, service_role;

revoke select on public.customers from authenticated;
-- Every column except the contact ones. A new column must be added here to be readable.
grant select (id, name, notes, is_active, reminders_paused, language, created_at)
  on public.customers to authenticated;

create or replace view public.team_escalations with (security_invoker = true) as
  select i.id as invoice_id,
         i.number,
         c.id as customer_id,
         c.name as customer_name,
         cc.whatsapp_number as phone,
         cc.billing_email as email,
         (public.jakarta_today() - i.due_on) as days_late,
         greatest(i.amount_due - public.invoice_paid(i.id), 0)::bigint as still_owed,
         i.due_on
    from public.invoices i
    join public.customers c on c.id = i.customer_id
    left join public.customer_contacts() cc on cc.customer_id = c.id
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

create or replace view public.reminders_to_send with (security_invoker = true) as
  select distinct on (r.invoice_id)
         r.id as reminder_id,
         r.invoice_id,
         i.number,
         c.id as customer_id,
         c.name as customer_name,
         cc.billing_email as email,
         cc.whatsapp_number as phone,
         c.language,
         coalesce(r.template_key, s.template_key) as template_key,
         coalesce(s.kind, r.template_key) as kind,
         s.offset_days,
         r.scheduled_for,
         i.due_on,
         i.issued_on,
         i.amount_due,
         i.transfer_amount as amount_to_transfer,
         greatest(i.amount_due - public.invoice_paid(i.id), 0)::bigint as still_owed,
         (coalesce(s.kind, r.template_key) = 'overdue'
            and not public.bank_seen_since(r.scheduled_for)) as waiting_for_bank
    from public.reminders r
    join public.invoices i on i.id = r.invoice_id
    join public.customers c on c.id = i.customer_id
    left join public.customer_contacts() cc on cc.customer_id = c.id
    left join public.reminder_schedule s on s.id = r.schedule_id
   where r.status = 'scheduled' and r.claimed_at is null and r.scheduled_for <= now()
     and (i.status in ('open', 'partly_paid') or r.template_key = 'thank_you')
     and not i.reminders_paused and not c.reminders_paused and c.is_active
   order by r.invoice_id, r.scheduled_for desc;

drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    public.current_app_role() = 'owner'
    or (public.current_app_role() is not null and table_name in ('entries', 'subscriptions'))
  );
