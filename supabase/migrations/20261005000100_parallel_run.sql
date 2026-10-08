-- P6-T6: the two-week parallel run before go-live. Each week the owner writes down the numbers
-- from the way they track money today; the app's own numbers are worked out by the database at
-- that same moment and stored next to them, so a later change can't rewrite what was compared.
-- Go-live needs two weeks in a row where all four match (the owner approves; see docs/launch.md).

create table public.parallel_run_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1), -- a Monday
  -- the owner's numbers: last week's money in / out, and cash + still owed at the time of recording
  their_came_in bigint not null check (their_came_in >= 0),
  their_went_out bigint not null check (their_went_out >= 0),
  their_cash bigint not null,
  their_still_owed bigint not null check (their_still_owed >= 0),
  -- the app's numbers, at the same moment (only set by record_parallel_week)
  app_came_in bigint not null,
  app_went_out bigint not null,
  app_cash bigint not null,
  app_still_owed bigint not null,
  notes text not null default '',
  recorded_by uuid default auth.uid(),
  recorded_at timestamptz not null default now()
);

alter table public.parallel_run_weeks enable row level security;
revoke all on public.parallel_run_weeks from anon, authenticated;
grant select on public.parallel_run_weeks to authenticated;
create policy parallel_run_weeks_owner_select on public.parallel_run_weeks
  for select to authenticated using (public.current_app_role() = 'owner');

select public.enable_audit('public.parallel_run_weeks');

-- Record (or re-record, e.g. after fixing a typo) one week. Runs with the owner's own rights for
-- reading the numbers; writes with the function owner's, since nobody may type the app's side.
create or replace function public.record_parallel_week(
  p_week_start date,
  p_came_in bigint,
  p_went_out bigint,
  p_cash bigint,
  p_still_owed bigint,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moves record;
  now_summary record;
begin
  if public.current_app_role() is distinct from 'owner' then
    raise exception 'Only the owner records the parallel run' using errcode = 'insufficient_privilege';
  end if;
  select * into moves from public.came_in_went_out(p_week_start, p_week_start + 6);
  select * into now_summary from public.money_summary();

  insert into public.parallel_run_weeks as w (
    week_start, their_came_in, their_went_out, their_cash, their_still_owed,
    app_came_in, app_went_out, app_cash, app_still_owed, notes
  ) values (
    p_week_start, p_came_in, p_went_out, p_cash, p_still_owed,
    moves.came_in, moves.went_out, now_summary.cash_in_bank, now_summary.still_owed,
    coalesce(p_notes, '')
  )
  on conflict (week_start) do update set
    their_came_in = excluded.their_came_in, their_went_out = excluded.their_went_out,
    their_cash = excluded.their_cash, their_still_owed = excluded.their_still_owed,
    app_came_in = excluded.app_came_in, app_went_out = excluded.app_went_out,
    app_cash = excluded.app_cash, app_still_owed = excluded.app_still_owed,
    notes = excluded.notes, recorded_by = auth.uid(), recorded_at = now();
end;
$$;

revoke all on function public.record_parallel_week(date, bigint, bigint, bigint, bigint, text)
  from public, anon;
grant execute on function public.record_parallel_week(date, bigint, bigint, bigint, bigint, text)
  to authenticated;
