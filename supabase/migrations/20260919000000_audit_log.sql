-- P0-T6: insert-only audit log, written by a trigger on every audited table.
--
-- Auditing lives in the database (not only in app code) so no write path can skip it:
-- the audit row is written in the same transaction as the change, or neither happens.
-- Attach to a table with:  select public.enable_audit('public.some_table');

create table public.audit_log (
  id bigint generated always as identity primary key,
  -- No foreign key: history must survive a user being removed.
  actor_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Nobody writes here directly — only the trigger below (security definer) inserts.
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated;

-- Readable by every team member who passed 2FA (they can already see the data it describes).
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.current_app_role() is not null);

-- Insert-only, even for roles that bypass RLS or hold table privileges.
-- Shared by every insert-only table (audit_log, bank_transactions).
create or replace function public.forbid_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is insert-only (% not allowed)', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.forbid_change();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.forbid_change();

-- Writes one audit row per changed row.
--   insert: new_value = full row      update: old/new = only the changed columns
--   delete: old_value = full row      no-op update: nothing logged
-- Reason: set in the same transaction with  select set_config('app.audit_reason', '...', true);
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

  insert into public.audit_log (actor_id, action, table_name, record_id, old_value, new_value, reason)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new_row, old_row) ->> 'id',
    old_diff,
    new_diff,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return null;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

create or replace function public.enable_audit(target regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger audit_row_change after insert or update or delete on %s
       for each row execute function public.audit_row_change()',
    target
  );
end;
$$;

revoke all on function public.enable_audit(regclass) from public, anon, authenticated;

-- Role changes are sensitive: audit the team table too.
select public.enable_audit('public.users');
