-- P7-T3: saved views. A view is a named set of list filters (the part of the address after "?").
-- Each person keeps their own; the owner can also mark a view as the starting view of a role
-- (e.g. operators open Money in & out on "Needs a label"). Not money data: no audit, can be
-- deleted.

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id),
  list text not null check (list in ('money', 'customers', 'invoices', 'reminders')),
  name text not null check (btrim(name) <> '' and length(name) <= 60),
  -- only a query string of plain characters: never a URL, a path, or markup
  query text not null default '' check (query ~ '^[A-Za-z0-9_.%=&+*-]*$' and length(query) <= 1000),
  default_for_role public.app_role,
  created_at timestamptz not null default now(),
  unique (user_id, list, name)
);

-- at most one starting view per list and role
create unique index saved_views_role_default_idx
  on public.saved_views (list, default_for_role) where default_for_role is not null;

alter table public.saved_views enable row level security;
revoke all on public.saved_views from anon, authenticated;
grant select, insert, delete on public.saved_views to authenticated;
grant update (name, query, default_for_role) on public.saved_views to authenticated;

-- See: your own views, the starting view of your role, and (owner) every role's starting view.
create policy saved_views_select on public.saved_views
  for select to authenticated
  using (
    public.current_app_role() is not null
    and (user_id = auth.uid()
         or default_for_role = public.current_app_role()
         or (default_for_role is not null and public.current_app_role() = 'owner'))
  );

-- Save: only as yourself; only the owner makes a view someone else's starting view.
create policy saved_views_insert on public.saved_views
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_app_role() is not null
    and (default_for_role is null or public.current_app_role() = 'owner')
  );

create policy saved_views_update on public.saved_views
  for update to authenticated
  using (user_id = auth.uid() and public.current_app_role() is not null)
  with check (
    user_id = auth.uid()
    and (default_for_role is null or public.current_app_role() = 'owner')
  );

-- Delete: your own; the owner can also remove any role's starting view.
create policy saved_views_delete on public.saved_views
  for delete to authenticated
  using (
    public.current_app_role() is not null
    and (user_id = auth.uid()
         or (default_for_role is not null and public.current_app_role() = 'owner'))
  );
