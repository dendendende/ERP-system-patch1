-- P3-T7: a person can send a reminder now, or pause a customer's reminders.
--
-- "Send now" only queues a message; the sender still applies every stop rule when it goes out
-- (a late notice still waits for a bank read). At most one per bill per day, so a double click
-- or an impatient afternoon never sends a customer the same message twice.

alter table public.reminders add column created_by uuid default auth.uid();

create or replace function public.send_reminder_now(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  cust public.customers;
  queued uuid;
begin
  if coalesce(public.current_app_role()::text, '') not in ('owner', 'operator') then
    raise exception 'Not allowed to send reminders' using errcode = 'insufficient_privilege';
  end if;

  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null or inv.status not in ('open', 'partly_paid') then
    raise exception 'This bill is not waiting for money' using errcode = 'check_violation';
  end if;
  select * into cust from public.customers where id = inv.customer_id;
  if inv.reminders_paused or cust.reminders_paused or not cust.is_active then
    raise exception 'Reminders are paused for this customer' using errcode = 'check_violation';
  end if;
  if cust.billing_email is null then
    raise exception 'This customer has no email address' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.reminders r
              where r.invoice_id = inv.id
                and ((r.template_key is not null and r.status = 'scheduled')
                     or r.sent_at > now() - interval '1 day')) then
    raise exception 'A reminder for this bill already went out today' using errcode = 'check_violation';
  end if;

  insert into public.reminders (invoice_id, template_key, channel, scheduled_for)
  values (inv.id,
          case when inv.due_on < public.jakarta_today() then 'overdue' else 'reminder' end,
          'email', -- WhatsApp is on hold (P3-T5)
          now())
  returning id into queued;
  return queued;
end;
$$;

revoke all on function public.send_reminder_now(uuid) from public, anon;
grant execute on function public.send_reminder_now(uuid) to authenticated;

-- Pause or resume one customer's reminders. Pausing needs a reason; both are audited (the
-- customers table is audited, and the reason goes with the change).
create or replace function public.set_reminders_paused(p_customer_id uuid, p_paused boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_app_role()::text, '') not in ('owner', 'operator') then
    raise exception 'Not allowed to pause reminders' using errcode = 'insufficient_privilege';
  end if;
  if p_paused and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why reminders are being paused' using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason',
                     coalesce(nullif(btrim(p_reason), ''), case when p_paused then 'Paused' else 'Resumed' end),
                     true);
  update public.customers set reminders_paused = p_paused where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
end;
$$;

revoke all on function public.set_reminders_paused(uuid, boolean, text) from public, anon;
grant execute on function public.set_reminders_paused(uuid, boolean, text) to authenticated;

-- Rule 3 also holds for a late notice sent by hand: it waits for a bank read like any other.
create or replace function public.claim_due_reminders(p_limit integer default 50)
returns table (
  id uuid,
  invoice_id uuid,
  channel text,
  template_key text,
  kind text,
  scheduled_for timestamptz,
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
     and r.status = 'scheduled' and r.claimed_at is null
     and r.template_key is distinct from 'thank_you'
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
       and (coalesce(s.kind, r.template_key) is distinct from 'overdue'
            or public.bank_seen_since(r.scheduled_for))
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

-- Rules 1 and 5 also cancel a queued "send now" message; only the thank-you survives payment.
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
     and template_key is distinct from 'thank_you';

  if new.status = 'paid'
     and exists (select 1 from public.payments p
                  where p.invoice_id = new.id and p.method <> 'no_transfer') then
    insert into public.reminders (invoice_id, template_key, channel, scheduled_for)
    select new.id, 'thank_you',
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
