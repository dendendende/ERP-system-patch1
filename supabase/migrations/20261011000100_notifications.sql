-- P9-T5a: the notifications centre — what needs a look, in one place, with a badge for what's
-- new since the person last opened it. Nothing is copied into a notifications table: each one is
-- read from where it already lives, so it can never disagree with the screen it links to.
--   mismatch         a balance check where the bank and our records don't add up
--   failed_delivery  a reminder that couldn't be sent
--   new_payee        a big payment out to someone never paid before
-- (A bank that has stopped updating is a state, not an event: the app adds it while it lasts.)

-- When each person last opened the centre. Only their own row, only through the function below.
create table public.notification_seen (
  user_id uuid primary key references public.users (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.notification_seen enable row level security;
revoke all on public.notification_seen from anon, authenticated;
grant select on public.notification_seen to authenticated;
create policy notification_seen_select on public.notification_seen
  for select to authenticated using (user_id = auth.uid());

create or replace function public.mark_notifications_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is null then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  insert into public.notification_seen (user_id, seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
end;
$$;

revoke all on function public.mark_notifications_seen() from public, anon;
grant execute on function public.mark_notifications_seen() to authenticated;

-- The last p_days of them, newest first, read with the person's own rights (RLS). is_new: arrived
-- in the app after they last opened the centre (a payment the bank sends a day late is still new).
-- A payment out is "big" from p_big rupiah.
-- Payees are compared by payee_pattern() over all earlier money out (P9-T7 replaces this with
-- a stored, indexed payee column: 20261011000300_perf_indexes.sql).
create or replace function public.notifications(
  p_days integer default 14,
  p_big bigint default 10000000
)
returns table (
  kind text,
  id uuid,
  at timestamptz,
  amount bigint,
  who text,
  detail text,
  link_id uuid,
  is_new boolean
)
language sql
stable
set search_path = ''
as $$
  with since as (select now() - make_interval(days => p_days) as at),
  seen as (
    select coalesce(
      (select s.seen_at from public.notification_seen s where s.user_id = auth.uid()),
      '-infinity'::timestamptz) as at
  )
  select n.kind, n.id, n.at, n.amount, n.who, n.detail, n.link_id, n.arrived > (select at from seen)
    from (
      select 'mismatch' as kind, b.id, b.created_at as at, b.difference as amount,
             a.bank_name || ' ••' || a.account_last4 as who, b.likely_cause as detail,
             a.id as link_id, b.created_at as arrived
        from public.balance_checks b
        join public.bank_accounts a on a.id = b.bank_account_id
       where b.status = 'mismatch' and b.created_at >= (select at from since)
      union all
      select 'failed_delivery', r.id, coalesce(r.claimed_at, r.scheduled_for), null,
             c.name, r.error, c.id, coalesce(r.claimed_at, r.scheduled_for)
        from public.reminders r
        join public.invoices i on i.id = r.invoice_id
        join public.customers c on c.id = i.customer_id
       where r.status = 'failed' and coalesce(r.claimed_at, r.scheduled_for) >= (select at from since)
      union all
      select 'new_payee', t.id, t.occurred_at, t.amount, t.description_raw, null, t.id,
             t.created_at
        from public.bank_transactions t
        join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
       where t.direction = 'out'
         and t.amount >= p_big
         and t.occurred_at >= (select at from since)
         -- moving money between our own accounts, or a cancelled mistake, pays nobody
         and not exists (select 1 from public.entries e
                           join public.categories c on c.id = e.category_id
                          where e.bank_transaction_id = t.id and c.report_group = 'transfer')
         and not exists (select 1 from public.bank_transactions p
                          where p.direction = 'out' and p.occurred_at < t.occurred_at
                            and public.payee_pattern(p.description_raw) = public.payee_pattern(t.description_raw))
    ) n
   order by n.at desc;
$$;

revoke all on function public.notifications(integer, bigint) from public, anon;
grant execute on function public.notifications(integer, bigint) to authenticated;
