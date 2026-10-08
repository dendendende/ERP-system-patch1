-- Owner request (after P7-T5): money recorded by hand, and details on every transaction.
--
-- • Money by hand: cash, or a transfer whose statement isn't here yet. It lives in
--   bank_transactions like everything else — so lists, totals, health, the forecast and bill
--   matching all see it — but marked: entered_by says who typed it (null = it came from the bank).
--   Like bank rows it never changes; a mistake is cancelled (below), which keeps it on record.
-- • Details: who the money came from / went to (counterparty) and a note, editable on every
--   transaction (statements often say nothing useful). They live on the entry, so they're audited.
-- • Cancelling a hand entry files it under "Cancelled (entered by mistake)". That category is in
--   the 'transfer' report group, which every total in the app already leaves out.
--   ponytail: reuses the transfer exclusion; give it its own report group if reports ever need
--   to tell cancelled entries from own transfers.

alter table public.bank_transactions add column entered_by uuid references public.users (id);
-- hand entries carry their own id space, so they can never collide with a bank's or a statement's
alter table public.bank_transactions add constraint bank_transactions_hand_id
  check ((entered_by is not null) = (external_id like 'hand:%'));

alter table public.entries add column counterparty text not null default ''
  check (length(counterparty) <= 200);
grant update (counterparty) on public.entries to authenticated;

insert into public.categories (name, type, report_group, is_system) values
  ('Cancelled (entered by mistake)', 'in', 'transfer', true),
  ('Cancelled (entered by mistake)', 'out', 'transfer', true);

-- A person can't claim someone else typed it.
create or replace function public.bank_transactions_stamp_hand()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entered_by is not null and current_user = 'authenticated' then
    new.entered_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger stamp_hand
  before insert on public.bank_transactions
  for each row execute function public.bank_transactions_stamp_hand();

-- What a person types is money data: audit it (what the bank sends is the bank's record already).
create trigger audit_hand_entry
  after insert on public.bank_transactions
  for each row when (new.entered_by is not null) execute function public.audit_row_change();

-- Only hand entries can be cancelled, and not while they pay a bill.
create or replace function public.entries_cancel_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is distinct from old.category_id
     and exists (select 1 from public.categories c
                  where c.id = new.category_id and c.is_system
                    and c.name = 'Cancelled (entered by mistake)') then
    if not exists (select 1 from public.bank_transactions t
                    where t.id = new.bank_transaction_id and t.entered_by is not null) then
      raise exception 'Only money entered by hand can be cancelled; what the bank sent stays'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.payments p where p.bank_transaction_id = new.bank_transaction_id) then
      raise exception 'This money paid a bill, so it can''t be cancelled'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger entries_cancel_check
  before update on public.entries
  for each row execute function public.entries_cancel_check();

-- A rule filing bank money as "cancelled" would quietly drop it from every total.
create or replace function public.rules_no_cancel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.categories c
              where c.id = new.category_id and c.is_system
                and c.name = 'Cancelled (entered by mistake)') then
    raise exception 'A rule can''t file money as cancelled' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger rules_no_cancel
  before insert or update on public.rules
  for each row execute function public.rules_no_cancel();

-- Record money by hand: the transaction and its details in one go. Runs with the person's own
-- rights (RLS: owner and operator). p_key makes a double click record it once.
create or replace function public.record_by_hand(
  p_key uuid,
  p_account uuid,
  p_day date,
  p_direction text,
  p_amount bigint,
  p_counterparty text default '',
  p_note text default '',
  p_category uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  tx_id uuid;
  description text := coalesce(nullif(btrim(p_counterparty), ''), nullif(btrim(p_note), ''),
                               'Entered by hand');
begin
  if p_day is null or p_day > today then
    raise exception 'The date can''t be in the future' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.bank_accounts a where a.id = p_account and a.is_active) then
    raise exception 'Choose an account' using errcode = 'check_violation';
  end if;

  insert into public.bank_transactions
    (bank_account_id, external_id, occurred_at, amount, direction, description_raw, entered_by)
  values (
    p_account, 'hand:' || p_key,
    -- today: now; an earlier day: midday, so it sits inside that Jakarta day
    case when p_day = today then now()
         else (p_day + time '12:00') at time zone 'Asia/Jakarta' end,
    p_amount, p_direction, left(description, 200), auth.uid()
  )
  on conflict (bank_account_id, external_id) do nothing
  returning id into tx_id;

  if tx_id is null then -- the same form sent twice: it's already there
    select t.id into tx_id from public.bank_transactions t
     where t.bank_account_id = p_account and t.external_id = 'hand:' || p_key;
    return tx_id;
  end if;

  if btrim(coalesce(p_counterparty, '')) <> '' or btrim(coalesce(p_note, '')) <> ''
     or p_category is not null then
    update public.entries
       set counterparty = left(btrim(coalesce(p_counterparty, '')), 200),
           note = left(btrim(coalesce(p_note, '')), 500),
           category_id = coalesce(p_category, category_id)
     where bank_transaction_id = tx_id;
  end if;
  return tx_id;
end;
$$;

revoke all on function public.record_by_hand(uuid, uuid, date, text, bigint, text, text, uuid)
  from public, anon;
grant execute on function public.record_by_hand(uuid, uuid, date, text, bigint, text, text, uuid)
  to authenticated;


-- The own-transfer pairing picked "the" transfer category by its report group; there are two per
-- direction now. Unchanged from 20260919000500 except that it names the one it means.
create or replace function public.create_entry_for_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rules;
  pair_entry uuid;
begin
  r := public.match_rule(new.direction, new.description_raw);
  insert into public.entries (bank_transaction_id, category_id, is_recurring, status, rule_id)
  values (
    new.id,
    r.category_id,
    coalesce(r.is_recurring, false),
    case when r.id is null then 'needs_label' else 'auto' end,
    r.id
  );

  select e.id into pair_entry
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    left join public.categories c on c.id = e.category_id
   where t.bank_account_id <> new.bank_account_id
     and t.direction <> new.direction
     and t.amount = new.amount
     and abs((t.occurred_at at time zone 'Asia/Jakarta')::date
             - (new.occurred_at at time zone 'Asia/Jakarta')::date) <= 1
     and e.status <> 'labelled'
     and c.report_group is distinct from 'transfer'
   order by abs(extract(epoch from t.occurred_at - new.occurred_at)), t.created_at
   limit 1
   for update of e skip locked;

  if pair_entry is not null then
    update public.entries e
       set category_id = c.id, status = 'auto', is_recurring = false, rule_id = null
      from public.bank_transactions t, public.categories c
     where t.id = e.bank_transaction_id
       and (e.id = pair_entry or e.bank_transaction_id = new.id)
       and c.is_system and c.report_group = 'transfer' and c.type = t.direction
       and c.name = 'Transfer between own accounts';
  end if;

  return null;
end;
$$;

-- money_list gains the details and whether it was typed by hand; search covers the details too.
drop function public.money_list_summary(date, date, text, uuid, text, uuid, bigint, bigint, text);
drop function public.money_list(date, date, text, uuid, text, uuid, bigint, bigint, text);

create function public.money_list(
  p_from date default null,
  p_to date default null,
  p_direction text default null,  -- 'in' | 'out'
  p_category uuid default null,
  p_status text default null,     -- 'needs_label' | 'labelled' | 'matched'
  p_account uuid default null,
  p_min bigint default null,      -- whole rupiah, inclusive
  p_max bigint default null,
  p_q text default null           -- part of the description, who, or the note
)
returns table (
  id uuid,
  occurred_at timestamptz,
  day date,
  amount bigint,
  direction text,
  description text,
  account_id uuid,
  account text,
  category_id uuid,
  category text,
  is_own_transfer boolean,
  status text,
  invoice_id uuid,
  invoice_number text,
  counterparty text,
  note text,
  by_hand boolean
)
language sql
stable
set search_path = ''
as $$
  select t.id,
         t.occurred_at,
         (t.occurred_at at time zone 'Asia/Jakarta')::date,
         t.amount,
         t.direction,
         t.description_raw,
         a.id,
         a.bank_name || ' ••' || a.account_last4,
         c.id,
         c.name,
         coalesce(c.report_group = 'transfer', false),
         e.status,
         e.invoice_id,
         i.number,
         e.counterparty,
         e.note,
         t.entered_by is not null
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    join public.bank_accounts a on a.id = t.bank_account_id
    left join public.categories c on c.id = e.category_id
    left join public.invoices i on i.id = e.invoice_id
   where (p_from is null or t.occurred_at >= (p_from::timestamp at time zone 'Asia/Jakarta'))
     and (p_to is null or t.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
     and (p_direction is null or t.direction = p_direction)
     and (p_category is null or e.category_id = p_category)
     and (p_status is null
          or (p_status = 'needs_label' and e.status = 'needs_label')
          or (p_status = 'labelled' and e.status <> 'needs_label')
          or (p_status = 'matched' and e.invoice_id is not null))
     and (p_account is null or t.bank_account_id = p_account)
     and (p_min is null or t.amount >= p_min)
     and (p_max is null or t.amount <= p_max)
     and (p_q is null
          or t.description_raw ilike '%' || p_q || '%'
          or e.counterparty ilike '%' || p_q || '%'
          or e.note ilike '%' || p_q || '%');
$$;

-- unchanged from 20261008000200, recreated because it reads money_list
create function public.money_list_summary(
  p_from date default null,
  p_to date default null,
  p_direction text default null,
  p_category uuid default null,
  p_status text default null,
  p_account uuid default null,
  p_min bigint default null,
  p_max bigint default null,
  p_q text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (
    select * from public.money_list(p_from, p_to, p_direction, p_category, p_status, p_account,
                                    p_min, p_max, p_q)
  ),
  counted as (select * from r where not is_own_transfer)
  select jsonb_build_object(
    'count', (select count(*) from r),
    'came_in', (select coalesce(sum(amount) filter (where direction = 'in'), 0)::text from counted),
    'went_out', (select coalesce(sum(amount) filter (where direction = 'out'), 0)::text from counted),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'came_in', m.came_in::text,
                                          'went_out', m.went_out::text) order by m.month)
        from (select date_trunc('month', day)::date as month,
                     coalesce(sum(amount) filter (where direction = 'in'), 0) as came_in,
                     coalesce(sum(amount) filter (where direction = 'out'), 0) as went_out
                from counted group by 1 order by 1 desc limit 12) m
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', k.category_id, 'category', k.category,
                                          'direction', k.direction, 'total', k.total::text,
                                          'count', k.n) order by k.total desc)
        from (select category_id, coalesce(category, 'Needs a label') as category, direction,
                     sum(amount) as total, count(*) as n
                from counted group by 1, 2, 3 order by 4 desc limit 6) k
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.money_list(date, date, text, uuid, text, uuid, bigint, bigint, text)
  from public, anon;
revoke all on function public.money_list_summary(date, date, text, uuid, text, uuid, bigint, bigint, text)
  from public, anon;
grant execute on function public.money_list(date, date, text, uuid, text, uuid, bigint, bigint, text)
  to authenticated;
grant execute on function public.money_list_summary(date, date, text, uuid, text, uuid, bigint, bigint, text)
  to authenticated;

-- trigger functions: nobody calls these directly
revoke all on function public.bank_transactions_stamp_hand() from public, anon, authenticated;
revoke all on function public.entries_cancel_check() from public, anon, authenticated;
revoke all on function public.rules_no_cancel() from public, anon, authenticated;

-- The daily balance check compares the bank's balances with what the bank sent: money typed in by
-- hand is not part of that. Unchanged from 20260930000100 except for that one line.
create or replace function public.check_balances(p_on date default public.jakarta_today())
returns setof public.balance_checks
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct record;
  first_start bigint;
  last_row record;
  bad record;
  prev_day date;
  dup record;
  cause text;
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'Only the balance check job runs this' using errcode = 'insufficient_privilege';
  end if;

  for acct in select id from public.bank_accounts where is_active loop
    -- every row, in the bank's order, with our running total and the start it implies
    create temp table if not exists _rows (
      occurred_at timestamptz, amount bigint, direction text, description text,
      balance bigint, running bigint, implied_start bigint
    ) on commit drop;
    truncate _rows;
    insert into _rows
    select t.occurred_at, t.amount, t.direction, t.description_raw, t.balance_after,
           sum(case when t.direction = 'in' then t.amount else -t.amount end)
             over (order by t.occurred_at, t.created_at, t.id),
           null
      from public.bank_transactions t
     where t.bank_account_id = acct.id
       and t.entered_by is null
       and (t.occurred_at at time zone 'Asia/Jakarta')::date <= p_on;
    update _rows set implied_start = balance - running where balance is not null;

    select implied_start into first_start
      from _rows where balance is not null order by occurred_at limit 1;
    select * into last_row
      from _rows where balance is not null order by occurred_at desc limit 1;

    if first_start is null then
      insert into public.balance_checks (bank_account_id, checked_on, status, likely_cause)
      values (acct.id, p_on, 'no_data', 'The bank never told us a balance for this account')
      on conflict (bank_account_id, checked_on) do update
        set status = excluded.status, likely_cause = excluded.likely_cause,
            expected = null, actual = null, difference = null, created_at = now();
      continue;
    end if;

    -- the first row whose implied start disagrees: something is missing or doubled before it
    select * into bad from _rows
     where balance is not null and implied_start <> first_start
     order by occurred_at limit 1;

    cause := null;
    if bad.occurred_at is not null then
      select max((occurred_at at time zone 'Asia/Jakarta')::date) into prev_day
        from _rows where balance is not null and occurred_at < bad.occurred_at;

      -- we have MORE than the bank: a row that looks doubled, of exactly that size?
      select amount, direction, (occurred_at at time zone 'Asia/Jakarta')::date as day into dup
        from _rows
       where occurred_at > (select max(occurred_at) from _rows where balance is not null and occurred_at < bad.occurred_at)
         and occurred_at <= bad.occurred_at
       group by amount, direction, description, (occurred_at at time zone 'Asia/Jakarta')::date
      having count(*) > 1
         and (case when direction = 'in' then 1 else -1 end) * amount = first_start - bad.implied_start
       limit 1;

      cause := case
        when dup.amount is not null then
          format('A %s of Rp %s on %s appears twice — one may be a duplicate',
                 case when dup.direction = 'in' then 'payment in' else 'payment out' end,
                 replace(to_char(dup.amount, 'FM999,999,999,999,999'), ',', '.'),
                 to_char(dup.day, 'DD Mon YYYY'))
        else
          format('The bank shows money moving between %s and %s that we never received — some days are missing',
                 to_char(prev_day, 'DD Mon YYYY'),
                 to_char((bad.occurred_at at time zone 'Asia/Jakarta')::date, 'DD Mon YYYY'))
      end;
    end if;

    insert into public.balance_checks
      (bank_account_id, checked_on, expected, actual, difference, status, likely_cause)
    values (acct.id, p_on, first_start + last_row.running, last_row.balance,
            last_row.balance - (first_start + last_row.running),
            case when bad.occurred_at is null then 'ok' else 'mismatch' end, cause)
    on conflict (bank_account_id, checked_on) do update
      set expected = excluded.expected, actual = excluded.actual, difference = excluded.difference,
          status = excluded.status, likely_cause = excluded.likely_cause, created_at = now();
  end loop;

  return query select * from public.balance_checks where checked_on = p_on;
end;
$$;
