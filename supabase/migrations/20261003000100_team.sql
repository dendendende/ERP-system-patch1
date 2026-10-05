-- P6-T2: team screen. People are switched off, never deleted (their history must keep a name),
-- and the team can never be left without an active owner.

alter table public.users add column is_active boolean not null default true;

-- A switched-off person has no role: every RLS policy is written against current_app_role(),
-- so they lose access to all data on their very next query.
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
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Never delete: not through the API, and not by removing the login (auth.users cascades here).
drop policy users_owner_delete on public.users;
revoke delete on public.users from authenticated;
grant update (is_active) on public.users to authenticated;

create or replace function public.users_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Team members are never deleted; switch them off instead.'
      using errcode = 'insufficient_privilege';
  end if;
  if old.role = 'owner' and old.is_active and not (new.role = 'owner' and new.is_active) then
    -- Lock the other owners: two owners demoting each other at once can't both succeed.
    perform 1 from public.users
     where role = 'owner' and is_active and id <> old.id
       for update;
    if not found then
      raise exception 'The team needs at least one owner. Make someone else an owner first.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger users_guard
  before update or delete on public.users
  for each row execute function public.users_guard();
