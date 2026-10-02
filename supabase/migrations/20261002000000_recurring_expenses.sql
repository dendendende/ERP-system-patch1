-- P5-T1a: costs that come back every month, quarter or year (rent, salaries, hosting). The forecast
-- (P5-T2) subtracts them on their expected dates. The app SUGGESTS them from the bank history;
-- only the owner creates one — nothing is ever added automatically.

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  category_id uuid references public.categories (id) on delete restrict,
  expected_amount bigint not null check (expected_amount > 0),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  is_active boolean not null default true,
  -- the payee pattern it was confirmed from, so it isn't suggested again
  source_pattern text unique,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Suggestions the owner said no to: never suggested again.
create table public.recurring_suggestion_dismissals (
  pattern text primary key,
  dismissed_by uuid default auth.uid(),
  dismissed_at timestamptz not null default now()
);

alter table public.recurring_expenses enable row level security;
alter table public.recurring_suggestion_dismissals enable row level security;
revoke all on public.recurring_expenses, public.recurring_suggestion_dismissals from anon, authenticated;
grant select, insert, update on public.recurring_expenses to authenticated;
grant select, insert on public.recurring_suggestion_dismissals to authenticated;
create policy recurring_expenses_select on public.recurring_expenses
  for select to authenticated using (public.current_app_role() is not null);
create policy recurring_expenses_owner_insert on public.recurring_expenses
  for insert to authenticated with check (public.current_app_role() = 'owner');
create policy recurring_expenses_owner_update on public.recurring_expenses
  for update to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');
create policy dismissals_select on public.recurring_suggestion_dismissals
  for select to authenticated using (public.current_app_role() is not null);
create policy dismissals_owner_insert on public.recurring_suggestion_dismissals
  for insert to authenticated with check (public.current_app_role() = 'owner');
select public.enable_audit('public.recurring_expenses');

-- The payee part of a bank description: letters only, so reference numbers that change every
-- month ("0925/FTSCY/WS12345") don't split one payee into many.
create or replace function public.payee_pattern(p_description text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(lower(p_description), '[^a-z]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Read-only: what LOOKS like a monthly cost. Same payee, once a month, 3+ months in a row with no
-- gap, amount within ±20%, and still going (seen last month or this month).
-- ponytail: monthly patterns only; quarterly / yearly ones are added by hand on the screen.
create or replace function public.suggest_recurring_expenses(p_today date default public.jakarta_today())
returns table (
  pattern text,
  name text,
  expected_amount bigint,
  day_of_month integer,
  months_seen integer,
  category_id uuid,
  last_seen date
)
language sql
stable
set search_path = ''
as $$
  with outs as (
    select public.payee_pattern(t.description_raw) as pattern, t.description_raw, t.amount,
           e.category_id, mv.day, date_trunc('month', mv.day)::date as month
      from public.money_moves mv
      join public.bank_transactions t on t.id = mv.id
      join public.entries e on e.bank_transaction_id = t.id
     where mv.direction = 'out' and mv.day <= p_today
       and mv.day >= (date_trunc('month', p_today) - interval '12 months')::date
  ),
  per_payee as (
    select o.pattern,
           count(*) as n,
           count(distinct o.month) as months,
           min(o.month) as first_month,
           max(o.month) as last_month,
           min(o.amount) as low,
           max(o.amount) as high,
           round(percentile_cont(0.5) within group (order by o.amount))::bigint as typical,
           mode() within group (order by extract(day from o.day)::int) as usual_day,
           max(o.day) as last_seen
      from outs o
     where o.pattern <> ''
     group by o.pattern
  )
  select p.pattern,
         (select o.description_raw from outs o where o.pattern = p.pattern order by o.day desc limit 1),
         p.typical,
         p.usual_day,
         p.months::int,
         (select o.category_id from outs o where o.pattern = p.pattern order by o.day desc limit 1),
         p.last_seen
    from per_payee p
   where p.months >= 3
     and p.n = p.months                                                     -- once a month
     and p.months = (extract(year from age(p.last_month, p.first_month)) * 12
                     + extract(month from age(p.last_month, p.first_month)) + 1)  -- no gaps
     and p.last_month >= (date_trunc('month', p_today) - interval '1 month')::date -- still going
     and p.high <= p.low * 1.2                                              -- similar amount
     and not exists (select 1 from public.recurring_expenses r where r.source_pattern = p.pattern)
     and not exists (select 1 from public.recurring_suggestion_dismissals d where d.pattern = p.pattern)
   order by p.typical desc;
$$;

grant execute on function public.payee_pattern(text) to authenticated;
grant execute on function public.suggest_recurring_expenses(date) to authenticated;
