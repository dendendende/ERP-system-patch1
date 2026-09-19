-- P1-T3: atomic sync batch.
--
-- One call = one transaction: insert the batch (duplicates skipped) AND stamp last_synced_at.
-- Any bad row aborts everything, so a batch is never half-saved and last_synced_at never
-- claims a sync that didn't land. Only the sync job (service_role) may call it.

create or replace function public.sync_bank_batch(
  p_account_id uuid,
  p_rows jsonb,
  p_synced_at timestamptz
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
begin
  update public.bank_accounts
     set last_synced_at = p_synced_at
   where id = p_account_id and is_active;
  if not found then
    raise exception 'bank account % not found or inactive', p_account_id;
  end if;

  -- amounts arrive as JSON strings so values above 2^53 stay exact
  insert into public.bank_transactions
    (bank_account_id, external_id, occurred_at, amount, direction, description_raw, balance_after)
  select p_account_id, r.external_id, r.occurred_at, r.amount, r.direction,
         coalesce(r.description_raw, ''), r.balance_after
    from jsonb_to_recordset(p_rows) as r (
      external_id text, occurred_at timestamptz, amount bigint, direction text,
      description_raw text, balance_after bigint
    )
  on conflict (bank_account_id, external_id) do nothing;
  get diagnostics inserted = row_count;

  return inserted;
end;
$$;

revoke all on function public.sync_bank_batch(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_bank_batch(uuid, jsonb, timestamptz) to service_role;

-- Audit: the sync stamps last_synced_at every run; that is bookkeeping, not a money change.
-- Columns passed as trigger arguments are ignored when diffing updates (an update that only
-- touches ignored columns writes no audit row).
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
     where n.value is distinct from o.value
       and not (n.key = any (coalesce(tg_argv, '{}'::text[])));
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

drop trigger audit_row_change on public.bank_accounts;
create trigger audit_row_change
  after insert or update or delete on public.bank_accounts
  for each row execute function public.audit_row_change('last_synced_at');
