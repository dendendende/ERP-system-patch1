-- P8-T6b: each person's own Home — which cues show, in what order. One row per person; no row
-- means the role's starting set. Not money data: no audit, can be deleted ("back to the start").

create table public.home_layouts (
  user_id uuid primary key default auth.uid() references public.users (id) on delete cascade,
  -- cue ids, as lib/home-cues.ts names them; unknown ones are ignored when Home is drawn
  cues text[] not null
    check (cardinality(cues) <= 50 and array_to_string(cues, ',') ~ '^[a-z0-9_,]*$'),
  updated_at timestamptz not null default now()
);

alter table public.home_layouts enable row level security;
revoke all on public.home_layouts from anon, authenticated;
grant select, insert, delete on public.home_layouts to authenticated;
grant update (cues, updated_at) on public.home_layouts to authenticated;

-- your own row only, and only with a role (2-step sign-in done)
create policy home_layouts_own on public.home_layouts
  for all to authenticated
  using (user_id = auth.uid() and public.current_app_role() is not null)
  with check (user_id = auth.uid() and public.current_app_role() is not null);
