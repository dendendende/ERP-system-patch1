-- P0-T5: user profiles, roles, and the role helper every RLS policy uses.

create type public.app_role as enum ('owner', 'operator', 'viewer');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- The signed-in user's role, or NULL when they have not passed 2FA in this session
-- (JWT aal != 'aal2'). Every policy is written against this, so no data is readable or
-- writable without 2FA, even if a route guard is bypassed.
-- Named current_app_role() because CURRENT_ROLE is a reserved SQL keyword.
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
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

-- Profiles: everyone on the team (2FA'd) can see the team; you can always see yourself
-- (needed on the 2FA screens). Only the owner changes names or roles.
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant insert, update (name, role), delete on public.users to authenticated;

create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.current_app_role() is not null);

create policy users_owner_insert on public.users
  for insert to authenticated
  with check (public.current_app_role() = 'owner');

create policy users_owner_update on public.users
  for update to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

create policy users_owner_delete on public.users
  for delete to authenticated
  using (public.current_app_role() = 'owner');

-- Every new auth user gets a profile. New people start as viewer; the owner promotes them.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
