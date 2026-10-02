-- P4-T2: does our copy of the bank add up to what the bank says?
--
-- Every row that carries the bank's balance implies where the account started:
--   bank balance after this row − our running total up to this row.
-- If nothing is missing or doubled, every row implies the same start. The first row that implies
-- a different one says WHEN it went wrong (since the previous balance row) and BY HOW MUCH.
-- ponytail: re-reads each account's whole history daily; fine for thousands of rows — anchor on
-- the last good check if accounts grow to hundreds of thousands.

create table public.balance_checks (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  checked_on date not null,
  expected bigint,          -- what our transactions add up to
  actual bigint,            -- what the bank says
  difference bigint,        -- actual − expected
  status text not null check (status in ('ok', 'mismatch', 'no_data')),
  likely_cause text,
  created_at timestamptz not null default now(),
  unique (bank_account_id, checked_on)
);

alter table public.balance_checks enable row level security;
revoke all on public.balance_checks from anon, authenticated;
grant select on public.balance_checks to authenticated;
create policy balance_checks_select on public.balance_checks
  for select to authenticated using (public.current_app_role() is not null);

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

revoke all on function public.check_balances(date) from public, anon, authenticated;
grant execute on function public.check_balances(date) to service_role;
