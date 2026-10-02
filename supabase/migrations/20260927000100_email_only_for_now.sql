-- WhatsApp is on hold (P3-T5 deferred by the owner, 2026-09-27): every customer message goes by
-- email. When WhatsApp arrives, the owner adds it back per step in the schedule settings (P3-T8).

select set_config('app.audit_reason', 'WhatsApp on hold: all reminders by email', false);

update public.reminder_schedule
   set channels = array['email']
 where kind <> 'escalate_team' and channels <> array['email'];

-- WhatsApp messages still waiting will never go: say so, and queue their email instead.
update public.reminders
   set status = 'cancelled', error = 'WhatsApp is switched off for now; sent by email instead'
 where channel = 'whatsapp' and status = 'scheduled' and claimed_at is null;

select public.schedule_reminders(id) from public.invoices where status in ('open', 'partly_paid');

-- The thank-you goes by WhatsApp only if a WhatsApp message actually reached them.
create or replace function public.invoices_stop_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reminders
     set status = 'cancelled',
         error = case new.status when 'paid' then 'The bill was paid' else 'The bill was cancelled' end
   where invoice_id = new.id and status = 'scheduled' and claimed_at is null
     and template_key is null;

  -- thank them, unless no money actually came (settled by the owner without a transfer)
  if new.status = 'paid'
     and exists (select 1 from public.payments p
                  where p.invoice_id = new.id and p.method <> 'no_transfer') then
    insert into public.reminders (invoice_id, template_key, channel, scheduled_for)
    select new.id, 'thank_you',
           -- one message, on WhatsApp if a WhatsApp message actually went out to them, else email
           case when exists (select 1 from public.reminders r
                              where r.invoice_id = new.id and r.channel = 'whatsapp'
                                and r.status in ('sent', 'delivered', 'read'))
                then 'whatsapp' else 'email' end,
           now()
    on conflict do nothing;
  end if;
  return null;
end;
$$;
