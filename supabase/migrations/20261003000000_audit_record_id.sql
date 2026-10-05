-- P6-T1: audit rows must say which record changed. record_id was always the row's "id", so
-- tables keyed by something else (health_thresholds: signal) logged record_id = null and the
-- change history could not tell which limit was changed. Use the primary key column instead
-- (still "id" for every other table). Rows already logged stay as they are: the log is insert-only.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  old_diff jsonb;
  new_diff jsonb;
  key_column text;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
      into old_diff, new_diff
      from jsonb_each(new_row) n
      join jsonb_each(old_row) o using (key)
     where n.value is distinct from o.value;
    if new_diff is null then
      return null;
    end if;
  else
    old_diff := old_row;
    new_diff := new_row;
  end if;

  -- Single-column primary key; every audited table has one.
  select a.attname into key_column
    from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
   where i.indrelid = tg_relid and i.indisprimary;

  insert into public.audit_log (actor_id, action, table_name, record_id, old_value, new_value, reason)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new_row, old_row) ->> coalesce(key_column, 'id'),
    old_diff,
    new_diff,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return null;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;
