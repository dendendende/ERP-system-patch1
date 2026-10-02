-- P3-T3: the stop rules. Checked again at the moment of sending, never trusted from earlier.
--
--   1. Bill fully paid   → every reminder not yet sent is cancelled, and one "payment received,
--                          thank you" goes out (unless it was settled without a transfer).
--   2. Bill partly paid  → the message shows what is still owed and the NEW unique amount,
--                          read from the bill when it is sent.
--   3. Overdue messages  → only if the bank has been read after the message was due. Until then
--                          it waits and is tried again next run: if they paid this morning and
--                          the bank hasn't been read since, we don't chase them.
--   4. Paused            → reminders for a paused bill or customer (or a switched-off customer)
--                          are skipped (cancelled), not saved up for later.
--   5. Bill cancelled    → every reminder not yet sent is cancelled.

alter table public.customers add column reminders_paused boolean not null default false;
alter table public.invoices add column reminders_paused boolean not null default false;

-- Messages that are not a schedule step (the thank-you) name their own template.
alter table public.reminders add column template_key text check (template_key ~ '^[a-z0-9_]+$');
alter table public.reminders
  add constraint reminders_step_or_template check ((schedule_id is null) <> (template_key is null));
create unique index reminders_one_thank_you
  on public.reminders (invoice_id) where template_key = 'thank_you';

-- Has every bank account been read after this moment? A synced account counts from its last
-- sync; a statement-import account from its newest imported row. No accounts = we know nothing.
create or replace function public.bank_seen_since(p_moment timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) > 0 and bool_and(seen > p_moment)
    from (
      select greatest(a.last_synced_at,
                      (select max(t.created_at) from public.bank_transactions t
                        where t.bank_account_id = a.id)) as seen
        from public.bank_accounts a
       where a.is_active
    ) accounts;
$$;

revoke all on function public.bank_seen_since(timestamptz) from public, anon;
grant execute on function public.bank_seen_since(timestamptz) to authenticated, service_role;

-- Rules 1 and 5, the moment the bill changes: nothing more goes out, and a thank-you if paid.
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
           -- one message, on WhatsApp if we were messaging them there, else email
           case when exists (select 1 from public.reminders r
                              where r.invoice_id = new.id and r.channel = 'whatsapp')
                then 'whatsapp' else 'email' end,
           now()
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger stop_reminders
  after update of status on public.invoices
  for each row
  when (new.status in ('paid', 'void') and old.status is distinct from new.status)
  execute function public.invoices_stop_reminders();

-- The sender's claim, now with the rules applied at the moment of sending.
drop function public.claim_due_reminders(integer);
create function public.claim_due_reminders(p_limit integer default 50)
returns table (
  id uuid,
  invoice_id uuid,
  channel text,
  template_key text,
  kind text,
  scheduled_for timestamptz,
  -- rule 2: read from the bill now, not when the reminder was queued
  amount_to_transfer text,
  still_owed text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the reminder sender claims reminders' using errcode = 'insufficient_privilege';
  end if;

  -- Rules 1 and 5 again, in case a bill changed between the trigger and now.
  update public.reminders r
     set status = 'cancelled',
         error = case i.status when 'paid' then 'The bill was paid' else 'The bill was cancelled' end
    from public.invoices i
   where i.id = r.invoice_id and i.status in ('paid', 'void')
     and r.status = 'scheduled' and r.claimed_at is null and r.template_key is null
     and r.scheduled_for <= now();

  -- Rule 4: paused (or switched off) — skipped, not saved up.
  update public.reminders r
     set status = 'cancelled', error = 'Reminders were paused'
    from public.invoices i
    join public.customers c on c.id = i.customer_id
   where i.id = r.invoice_id
     and (i.reminders_paused or c.reminders_paused or not c.is_active)
     and r.status = 'scheduled' and r.claimed_at is null and r.scheduled_for <= now();

  return query
  with due as (
    select r.id
      from public.reminders r
      left join public.reminder_schedule s on s.id = r.schedule_id
     where r.status = 'scheduled' and r.claimed_at is null and r.scheduled_for <= now()
       -- rule 3: overdue waits until the bank has been read after it was due
       and (s.kind is distinct from 'overdue' or public.bank_seen_since(r.scheduled_for))
     order by r.scheduled_for
     limit greatest(p_limit, 0)
       for update of r skip locked
  ), claimed as (
    update public.reminders r set claimed_at = now()
      from due where r.id = due.id
    returning r.id, r.invoice_id, r.channel, r.schedule_id, r.template_key, r.scheduled_for
  )
  select c.id, c.invoice_id, c.channel,
         coalesce(c.template_key, s.template_key),
         coalesce(s.kind, c.template_key),
         c.scheduled_for,
         i.transfer_amount::text,
         greatest(i.amount_due - public.invoice_paid(i.id), 0)::text
    from claimed c
    join public.invoices i on i.id = c.invoice_id
    left join public.reminder_schedule s on s.id = c.schedule_id
   order by c.scheduled_for;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;
