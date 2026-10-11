-- P9-T7: row-level security asked "who is this?" once per ROW. current_app_role() and auth.uid()
-- are stable, but a bare call in a policy still runs for every row it checks: with 50,000 bank
-- rows that was ~2s on Home and ~10s on Money in & out. Wrapped in a sub-select, Postgres asks
-- once per query and reuses the answer. Same rules, same answers — only how often they're asked.
-- (A DB test keeps every policy, including new ones, written this way.)

do $$
declare
  p record;
  wrap constant text := '(select public.current_app_role())';
  uid constant text := '(select auth.uid())';
  q text;
  c text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_catalog.pg_policies where schemaname = 'public'
  loop
    q := replace(replace(p.qual, 'auth.uid()', uid), 'current_app_role()', wrap);
    c := replace(replace(p.with_check, 'auth.uid()', uid), 'current_app_role()', wrap);
    if q is distinct from p.qual then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, q);
    end if;
    if c is distinct from p.with_check then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, c);
    end if;
  end loop;
end;
$$;
