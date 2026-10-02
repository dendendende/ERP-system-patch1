-- P3-T1: reminder tables and the schedule they follow.
--
-- reminder_schedule says WHEN to remind (days before/after the due date) and HOW (channels,
-- template). reminders holds one row per message per channel for one invoice: what is queued,
-- what was sent, what the provider said about it. Nothing here sends anything — that is the
-- sender job (P3-T2), which re-checks the stop rules (P3-T3) right before every send.

create table public.reminder_schedule (
  id uuid primary key default gen_random_uuid(),
  -- days relative to the invoice's due date: −14 = two weeks before, +3 = three days late
  offset_days integer not null check (offset_days between -60 and 60),
  kind text not null
    check (kind in ('invoice', 'reminder', 'due_tomorrow', 'overdue', 'escalate_team')),
  channels text[] not null default '{}'
    check (channels <@ array['whatsapp', 'email']::text[]),
  template_key text not null check (template_key ~ '^[a-z0-9_]+$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (offset_days, kind),
  -- escalation goes to the team (a task on Home), never to the customer; everything else
  -- must reach the customer somehow
  check ((kind = 'escalate_team') = (cardinality(channels) = 0))
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  schedule_id uuid references public.reminder_schedule (id) on delete restrict,
  channel text not null check (channel in ('whatsapp', 'email')),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  provider_message_id text,
  -- the amount the message asked for, exactly as sent (what is owed changes; this must not)
  amount_shown bigint check (amount_shown > 0),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  -- sent_at says whether it actually left; a failure can happen before or after that
  check (case status
           when 'scheduled' then sent_at is null
           when 'cancelled' then sent_at is null
           when 'failed' then true
           else sent_at is not null
         end)
);

-- The idempotency key: one reminder per invoice, schedule step and channel, ever.
create unique index reminders_once
  on public.reminders (invoice_id, schedule_id, channel) where schedule_id is not null;
-- The sender's question every 15 minutes: what is due now?
create index reminders_due on public.reminders (scheduled_for) where status = 'scheduled';
create index reminders_invoice on public.reminders (invoice_id);
create unique index reminders_provider_message
  on public.reminders (channel, provider_message_id) where provider_message_id is not null;

alter table public.reminder_schedule enable row level security;
alter table public.reminders enable row level security;

-- Schedule: the team reads it; the owner changes it (P3-T8). Steps are switched off, never
-- deleted, because sent reminders point at them.
revoke all on public.reminder_schedule from anon, authenticated;
grant select, insert, update on public.reminder_schedule to authenticated;
create policy reminder_schedule_select on public.reminder_schedule
  for select to authenticated using (public.current_app_role() is not null);
create policy reminder_schedule_owner_insert on public.reminder_schedule
  for insert to authenticated with check (public.current_app_role() = 'owner');
create policy reminder_schedule_owner_update on public.reminder_schedule
  for update to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');

-- Reminders: the team reads them; only the scheduler and sender (service_role) write them.
revoke all on public.reminders from anon, authenticated;
grant select on public.reminders to authenticated;
create policy reminders_select on public.reminders
  for select to authenticated using (public.current_app_role() is not null);

select public.enable_audit('public.reminder_schedule');
-- ponytail: reminders are not audited row by row — delivery webhooks update them constantly and
-- they hold no money. Pausing reminders (P3-T7) is audited where it happens.

-- The default schedule.
insert into public.reminder_schedule (offset_days, kind, channels, template_key) values
  (-14, 'invoice',       array['whatsapp', 'email'], 'invoice'),
  (-7,  'reminder',      array['whatsapp'],          'reminder'),
  (-1,  'due_tomorrow',  array['whatsapp'],          'due_tomorrow'),
  (3,   'overdue',       array['whatsapp', 'email'], 'overdue'),
  (7,   'overdue',       array['whatsapp', 'email'], 'overdue'),
  (14,  'escalate_team', array[]::text[],            'escalate_team');
