-- Fix: a reminder sent by hand has no provider message id. (Stamping every one "sent by hand"
-- broke the second one: provider ids are unique per channel.) Sent by hand = sent_by is set.

update public.reminders set provider_message_id = null where provider_message_id = 'sent by hand';

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
