-- P9-T4a: bulk actions — label many transactions, remind about many bills, cancel many bills.
--   Each one runs the same rules as doing it one at a time (the triggers and the single-row
--   functions), row by row: one row that can't be done is reported with the reason and the
--   rest still happen. Every change is audited, as one at a time, with a reason saying how many
--   were done together. At most 1,000 at once.

-- Reminders a person puts on the list (send now, alone or in bulk) are now audited too: who
-- asked for which bill, when. Scheduled ones and thank-yous are the app's own, not audited.
create trigger audit_hand_reminder
  after insert on public.reminders
  for each row when (new.schedule_id is null and new.template_key in ('reminder', 'overdue'))
  execute function public.audit_row_change();

create or replace function public.bulk_check(p_ids uuid[], p_what text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(public.current_app_role()::text, '') not in ('owner', 'operator') then
    raise exception 'Not allowed to %', p_what using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    raise exception 'Nothing ticked' using errcode = 'check_violation';
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'At most 1,000 at a time' using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.bulk_check(uuid[], text) from public, anon;
grant execute on function public.bulk_check(uuid[], text) to authenticated; -- it only refuses

-- Label: each transaction's entry gets the category. The direction check (entries trigger)
-- still applies per row. Cancelling is never done in bulk, and a cancelled entry stays so.
create or replace function public.bulk_label(p_transaction_ids uuid[], p_category_id uuid)
returns table (id uuid, error text)
language plpgsql
set search_path = ''
as $$
declare
  t uuid;
  -- one for money in and one for money out
  cancelled uuid[] := array(select c.id from public.categories c
                             where c.is_system and c.name = 'Cancelled (entered by mistake)');
begin
  perform public.bulk_check(p_transaction_ids, 'label transactions');
  if p_category_id = any(cancelled) then
    raise exception 'Cancel money one entry at a time, from the entry itself'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.categories c where c.id = p_category_id) then
    raise exception 'No such category' using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason',
                     format('Labelled %s at once', cardinality(p_transaction_ids)), true);
  foreach t in array p_transaction_ids loop
    id := t;
    error := null;
    begin
      update public.entries e
         set category_id = p_category_id
       where e.bank_transaction_id = t
         and coalesce(e.category_id <> all(cancelled), true);
      if not found then
        error := case when exists (select 1 from public.entries e where e.bank_transaction_id = t)
                      then 'It was cancelled, so it stays as it is'
                      else 'Not found' end;
      end if;
    exception when others then
      error := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.bulk_label(uuid[], uuid) from public, anon;
grant execute on function public.bulk_label(uuid[], uuid) to authenticated;

-- Remind: put a reminder for each bill on today's list, as "Send a reminder now" does.
create or replace function public.bulk_send_reminder_now(p_invoice_ids uuid[])
returns table (id uuid, error text)
language plpgsql
set search_path = ''
as $$
declare
  i uuid;
begin
  perform public.bulk_check(p_invoice_ids, 'send reminders');
  perform set_config('app.audit_reason',
                     format('Reminded about %s bills at once', cardinality(p_invoice_ids)), true);
  foreach i in array p_invoice_ids loop
    id := i;
    error := null;
    begin
      perform public.send_reminder_now(i);
    exception when others then
      error := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.bulk_send_reminder_now(uuid[]) from public, anon;
grant execute on function public.bulk_send_reminder_now(uuid[]) to authenticated;

-- Cancel: bills nothing has been paid towards yet, with one reason for all. A partly paid bill
-- is cancelled on its own page, where what was paid can be seen first.
create or replace function public.bulk_void_invoices(p_invoice_ids uuid[], p_reason text)
returns table (id uuid, error text)
language plpgsql
set search_path = ''
as $$
declare
  i uuid;
begin
  perform public.bulk_check(p_invoice_ids, 'cancel bills');
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the bills are being cancelled' using errcode = 'check_violation';
  end if;

  foreach i in array p_invoice_ids loop
    id := i;
    error := null;
    begin
      if exists (select 1 from public.invoices v where v.id = i and v.status = 'partly_paid') then
        error := 'Partly paid: cancel it on its own page';
      else
        perform public.void_invoice(
          i, format('%s (cancelled %s at once)', btrim(p_reason), cardinality(p_invoice_ids)));
      end if;
    exception when others then
      error := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.bulk_void_invoices(uuid[], text) from public, anon;
grant execute on function public.bulk_void_invoices(uuid[], text) to authenticated;
