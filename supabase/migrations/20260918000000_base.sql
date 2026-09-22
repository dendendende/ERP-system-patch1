-- Base helpers shared by every later migration.

-- Business dates are always Asia/Jakarta ("due today", schedules), regardless of server timezone.
create or replace function public.jakarta_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Jakarta')::date;
$$;
