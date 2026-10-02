-- P3-T8: when the owner changes the reminder schedule, every reminder NOT YET SENT follows the
-- new schedule; anything already sent (or being sent right now) is never touched.
--   • step switched off, or a channel removed → its queued messages are cancelled
--   • days moved → queued messages move (a day now in the past is dropped, except the bill)
--   • step switched back on, or a channel added → bills still waiting get the message again

create or replace function public.reminder_schedule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- no longer wanted: cancelled, with a reason the timeline can show
  update public.reminders r
     set status = 'cancelled', error = 'The reminder schedule changed'
   where r.schedule_id = new.id
     and r.status = 'scheduled' and r.claimed_at is null
     and (not new.is_active or not (r.channel = any (new.channels)));

  if not new.is_active then
    return null;
  end if;

  -- still wanted: queue (or bring back, or move) one per waiting bill and channel
  insert into public.reminders (invoice_id, schedule_id, channel, scheduled_for)
  select i.id, new.id, channel, greatest(public.reminder_time(i.due_on, new.offset_days), now())
    from public.invoices i
    cross join lateral unnest(new.channels) as channel
   where i.status in ('open', 'partly_paid')
     and (i.due_on + new.offset_days >= public.jakarta_today() or new.kind = 'invoice')
  on conflict (invoice_id, schedule_id, channel) where schedule_id is not null
  do update set scheduled_for = excluded.scheduled_for, status = 'scheduled', error = null
   where public.reminders.claimed_at is null
     and (public.reminders.status = 'scheduled'
          or (public.reminders.status = 'cancelled'
              and public.reminders.error = 'The reminder schedule changed'));

  -- queued ones whose new day has already passed are dropped (the bill itself still goes)
  update public.reminders r
     set status = 'cancelled', error = 'The reminder schedule changed'
    from public.invoices i
   where r.schedule_id = new.id and i.id = r.invoice_id
     and r.status = 'scheduled' and r.claimed_at is null
     and i.due_on + new.offset_days < public.jakarta_today() and new.kind <> 'invoice';
  return null;
end;
$$;

create trigger reminder_schedule_changed
  after update of offset_days, channels, is_active on public.reminder_schedule
  for each row
  when (old.offset_days is distinct from new.offset_days
        or old.channels is distinct from new.channels
        or old.is_active is distinct from new.is_active)
  execute function public.reminder_schedule_changed();
