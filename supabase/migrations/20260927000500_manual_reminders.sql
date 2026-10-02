-- Reminders remind the TEAM, not the customer (owner's decision, 2026-09-27). Automatic sending is
-- on hold: when a reminder is due it appears on the team's list, a person sends it themselves
-- (email, WhatsApp, or through Cowork) and marks it sent. The same stop rules decide what is on
-- the list: paid or cancelled bills drop off (their reminders are cancelled), paused customers
-- are left out, and a late notice is flagged while the bank hasn't been read since it was due.

alter table public.reminders add column sent_by uuid;

-- One line per bill: its most recent due reminder. Older ones it replaces are closed when this
-- one is sent or skipped, so a customer who was forgotten for a week gets one message, not three.
create or replace view public.reminders_to_send with (security_invoker = true) as
  select distinct on (r.invoice_id)
         r.id as reminder_id,
         r.invoice_id,
         i.number,
         c.id as customer_id,
         c.name as customer_name,
         c.billing_email as email,
         c.whatsapp_number as phone,
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
         -- rule 3: don't chase a late payer until the bank has been read after it became late
         (coalesce(s.kind, r.template_key) = 'overdue'
            and not public.bank_seen_since(r.scheduled_for)) as waiting_for_bank
    from public.reminders r
    join public.invoices i on i.id = r.invoice_id
    join public.customers c on c.id = i.customer_id
    left join public.reminder_schedule s on s.id = r.schedule_id
   where r.status = 'scheduled' and r.claimed_at is null and r.scheduled_for <= now()
     and (i.status in ('open', 'partly_paid') or r.template_key = 'thank_you')
     and not i.reminders_paused and not c.reminders_paused and c.is_active
   order by r.invoice_id, r.scheduled_for desc;

grant select on public.reminders_to_send to authenticated;

-- A person sent it (or decided not to). Owner or operator; records who, when and the amount the
-- message asked for. Older due reminders for the same bill are closed with it.
create or replace function public.close_reminder(p_reminder_id uuid, p_sent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rem public.reminders;
  inv public.invoices;
begin
  if coalesce(public.current_app_role()::text, '') not in ('owner', 'operator') then
    raise exception 'Not allowed to send reminders' using errcode = 'insufficient_privilege';
  end if;

  select * into rem from public.reminders where id = p_reminder_id for update;
  if rem.id is null or rem.status <> 'scheduled' or rem.claimed_at is not null then
    raise exception 'This reminder was already dealt with' using errcode = 'check_violation';
  end if;
  select * into inv from public.invoices where id = rem.invoice_id;

  update public.reminders
     set status = case when p_sent then 'sent' else 'cancelled' end,
         sent_at = case when p_sent then now() end,
         sent_by = auth.uid(),
         provider_message_id = case when p_sent then 'sent by hand' end,
         amount_shown = case when p_sent then inv.transfer_amount end,
         error = case when p_sent then null else 'Skipped by someone on the team' end
   where id = rem.id;

  -- earlier ones for this bill that nobody sent are covered by this one
  update public.reminders
     set status = 'cancelled', error = 'Replaced by a later reminder'
   where invoice_id = rem.invoice_id and id <> rem.id
     and status = 'scheduled' and claimed_at is null and scheduled_for <= rem.scheduled_for;
end;
$$;

revoke all on function public.close_reminder(uuid, boolean) from public, anon;
grant execute on function public.close_reminder(uuid, boolean) to authenticated;
