-- P6-T3b: rate limits for the public pages, and a record of new devices signing in.

-- Failed attempts per key ("login:ip:1.2.3.4", "login:email:a@b.c"), in a fixed time window.
-- Only failures count, so people who sign in correctly are never slowed down. Only the server
-- (service role) touches this; rows older than a day are cleared as it goes.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  failures int not null
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.too_many_failures(p_key text, p_max int, p_window_seconds int)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select failures >= p_max from public.rate_limits
     where key = p_key and window_start > now() - make_interval(secs => p_window_seconds)
  ), false);
$$;

create or replace function public.record_failure(p_key text, p_window_seconds int)
returns void
language sql
set search_path = ''
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
  insert into public.rate_limits (key, window_start, failures) values (p_key, now(), 1)
  on conflict (key) do update set
    failures = case when rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
                    then 1 else rate_limits.failures + 1 end,
    window_start = case when rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
                        then now() else rate_limits.window_start end;
$$;

revoke all on function public.too_many_failures(text, int, int) from public, anon, authenticated;
revoke all on function public.record_failure(text, int) from public, anon, authenticated;
grant execute on function public.too_many_failures(text, int, int) to service_role;
grant execute on function public.record_failure(text, int) to service_role;

-- A browser the app hasn't seen this person use before. Written on the first page after 2FA
-- (src/proxy.ts); the owner sees new ones on Home. Kept, never edited: it is a security record.
create table public.sign_in_devices (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id),
  device_id uuid not null,
  user_agent text,
  ip text,
  first_seen timestamptz not null default now(),
  unique (user_id, device_id)
);
alter table public.sign_in_devices enable row level security;
revoke all on public.sign_in_devices from anon, authenticated;
grant select, insert on public.sign_in_devices to authenticated;

create policy sign_in_devices_insert_own on public.sign_in_devices
  for insert to authenticated
  with check (user_id = auth.uid() and public.current_app_role() is not null);

create policy sign_in_devices_owner_select on public.sign_in_devices
  for select to authenticated
  using (public.current_app_role() = 'owner');

create trigger sign_in_devices_no_update_delete
  before update or delete on public.sign_in_devices
  for each row execute function public.forbid_change();
