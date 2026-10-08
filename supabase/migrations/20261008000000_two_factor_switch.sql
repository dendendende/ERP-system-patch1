-- Owner decision 2026-10-08: 2-step sign-in can be switched off while the owner works alone, and
-- back on (Settings → Team) when the team grows. One setting, read by both the database (RLS) and
-- the sign-in pages, so they can never disagree. ON by default: a new database starts secure.

create table public.security_settings (
  id boolean primary key default true check (id), -- exactly one row
  require_two_factor boolean not null default true
);
insert into public.security_settings default values;

alter table public.security_settings enable row level security;
revoke all on public.security_settings from anon, authenticated;
grant select on public.security_settings to authenticated;
grant update (require_two_factor) on public.security_settings to authenticated;

-- Everyone signed in can read it (the sign-in pages need it before 2FA); only the owner changes it.
create policy security_settings_select on public.security_settings
  for select to authenticated using (true);
create policy security_settings_owner_update on public.security_settings
  for update to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

select public.enable_audit('public.security_settings');

create or replace function public.two_factor_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select require_two_factor from public.security_settings), true);
$$;
revoke all on function public.two_factor_required() from public, anon;
grant execute on function public.two_factor_required() to authenticated, service_role;

-- The role every RLS policy checks: needs a 2FA'd session (aal2) only while 2FA is required.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.users u
  where u.id = auth.uid()
    and u.is_active
    and (coalesce(auth.jwt() ->> 'aal', '') = 'aal2' or not public.two_factor_required());
$$;
