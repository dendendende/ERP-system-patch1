-- P3-T2: queue reminders when a bill is written, and hand them to the sender exactly once.
--
-- Queueing: every new invoice gets one reminder per active schedule step and channel, at 08:00
-- Jakarta on that step's day. Steps whose day has already passed are skipped — except the bill
-- itself, which goes out now. Moving the due date moves the reminders not yet sent.
--
-- Sending is AT MOST ONCE. The sender claims due reminders (claimed_at); a claimed reminder is
-- never claimed again. If the sender dies between sending and recording the result, nobody
-- knows whether the message left, so after 30 minutes it is marked failed for a person to check
-- — a customer getting the same message twice is worse than a person having to look.

alter table public.reminders add column claimed_at timestamptz;

-- When a step of this invoice's schedule happens: 08:00 Jakarta on due date + offset.
create or replace function public.reminder_time(p_due_on date, p_offset_days integer)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select ((p_due_on + p_offset_days)::timestamp + time '08:00') at time zone 'Asia/Jakarta';
$$;

create or replace function public.schedule_reminders(p_invoice_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  insert into public.reminders (invoice_id, schedule_id, channel, scheduled_for)
  select i.id, s.id, channel, greatest(public.reminder_time(i.due_on, s.offset_days), now())
    from public.invoices i
    cross join public.reminder_schedule s
    cross join lateral unnest(s.channels) as channel
   where i.id = p_invoice_id
     and i.status in ('open', 'partly_paid')
     and s.is_active
     -- a step already in the past is skipped, except the bill itself
     and (i.due_on + s.offset_days >= public.jakarta_today() or s.kind = 'invoice')
  on conflict do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function public.schedule_reminders(uuid) from public, anon, authenticated;

create or replace function public.invoices_schedule_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.schedule_reminders(new.id);
  elsif new.due_on is distinct from old.due_on then
    -- move what hasn't gone out; steps that now fall in the past are dropped
    update public.reminders r
       set scheduled_for = greatest(public.reminder_time(new.due_on, s.offset_days), now()),
           status = case
                      when new.due_on + s.offset_days < public.jakarta_today() and s.kind <> 'invoice'
                        then 'cancelled'
                      else 'scheduled'
                    end
      from public.reminder_schedule s
     where s.id = r.schedule_id
       and r.invoice_id = new.id
       and r.status = 'scheduled'
       and r.claimed_at is null;
  end if;
  return null;
end;
$$;

create trigger schedule_reminders
  after insert or update of due_on on public.invoices
  for each row execute function public.invoices_schedule_reminders();

-- Bills already waiting when this ships get their reminders too.
select public.schedule_reminders(id) from public.invoices where status in ('open', 'partly_paid');

-- The sender: take up to p_limit due reminders for yourself. Rows another sender holds are
-- skipped (skip locked), and a claimed row is never handed out again.
create or replace function public.claim_due_reminders(p_limit integer default 50)
returns table (
  id uuid,
  invoice_id uuid,
  channel text,
  template_key text,
  kind text,
  scheduled_for timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the reminder sender claims reminders' using errcode = 'insufficient_privilege';
  end if;

  return query
  with due as (
    select r.id
      from public.reminders r
     where r.status = 'scheduled' and r.claimed_at is null and r.scheduled_for <= now()
     order by r.scheduled_for
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.reminders r set claimed_at = now()
      from due where r.id = due.id
    returning r.id, r.invoice_id, r.channel, r.schedule_id, r.scheduled_for
  )
  select c.id, c.invoice_id, c.channel, s.template_key, s.kind, c.scheduled_for
    from claimed c
    left join public.reminder_schedule s on s.id = c.schedule_id
   order by c.scheduled_for;
end;
$$;

-- The sender says how it went. Only a claimed, not-yet-recorded reminder can be recorded, so a
-- second report for the same message changes nothing (returns false).
create or replace function public.record_reminder_result(
  p_id uuid,
  p_sent boolean,
  p_provider_message_id text default null,
  p_amount_shown bigint default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the reminder sender records results' using errcode = 'insufficient_privilege';
  end if;

  update public.reminders
     set status = case when p_sent then 'sent' else 'failed' end,
         sent_at = case when p_sent then now() end,
         provider_message_id = p_provider_message_id,
         amount_shown = p_amount_shown,
         error = left(p_error, 500)
   where id = p_id and status = 'scheduled' and claimed_at is not null;
  return found;
end;
$$;

-- Claims older than 30 minutes with no result: the sender died mid-send. Never resent.
create or replace function public.fail_stale_reminder_claims()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  failed integer;
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the reminder sender does this' using errcode = 'insufficient_privilege';
  end if;

  update public.reminders
     set status = 'failed',
         error = 'The sender stopped before it could say whether this went out. Check before sending it again.'
   where status = 'scheduled' and claimed_at < now() - interval '30 minutes';
  get diagnostics failed = row_count;
  return failed;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
revoke all on function public.record_reminder_result(uuid, boolean, text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.fail_stale_reminder_claims() from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;
grant execute on function public.record_reminder_result(uuid, boolean, text, bigint, text) to service_role;
grant execute on function public.fail_stale_reminder_claims() to service_role;
