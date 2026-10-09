-- P8-T5: one row per metric per day, taken by the daily job, so history and trends survive
-- (sparklines, "a month ago" for the forecast, forecast accuracy). Today's numbers are always
-- worked out live; the snapshots are the past.
--
-- Rupiah stays bigint (money rule 1); ratios, days and months are numeric. Never both.
-- The first snapshot of a month also keeps what the forecast expected to come in and go out
-- for the rest of that month (forecast_month_in / _out), to score it once the month is over.

create table public.metric_snapshots (
  taken_on date not null,
  metric text not null check (metric ~ '^[a-z0-9_]+$'),
  rupiah bigint,
  value numeric,
  primary key (taken_on, metric),
  check (rupiah is null or value is null)   -- both null = not enough data that day
);

alter table public.metric_snapshots enable row level security;
revoke all on public.metric_snapshots from anon, authenticated;
grant select on public.metric_snapshots to authenticated;
grant select, insert, update on public.metric_snapshots to service_role;
create policy metric_snapshots_select on public.metric_snapshots
  for select to authenticated using (public.current_app_role() is not null);

-- Money in and out over days, for scoring the forecast; the jobs may ask too.
grant execute on function public.came_in_went_out(date, date) to service_role;
