-- P6-T3: signed-out visitors (anon) get nothing in the app's schema. Supabase grants new tables,
-- views and functions to anon by default, and Postgres lets PUBLIC run every function. RLS
-- already kept the data hidden; this removes the access itself. supabase/tests/rls-coverage
-- fails if anything new is reachable again.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- Functions: take away the PUBLIC grant, give it back only to who had it on purpose.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as team_can
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.team_can then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end;
$$;

-- Views are for reading. (They run with the reader's rights, so writing through one was
-- already limited by the tables' own rules; now it isn't possible at all.)
do $$
declare
  v record;
begin
  for v in
    select c.oid::regclass as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on %s from authenticated', v.name);
  end loop;
end;
$$;
