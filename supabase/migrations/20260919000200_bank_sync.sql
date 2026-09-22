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
-- Updates that change nothing else are not audited.
drop trigger audit_row_change on public.bank_accounts;
create trigger audit_row_change
  after insert or delete on public.bank_accounts
  for each row execute function public.audit_row_change();
create trigger audit_row_change_update
  after update on public.bank_accounts
  for each row
  when ((to_jsonb(old) - 'last_synced_at') is distinct from (to_jsonb(new) - 'last_synced_at'))
  execute function public.audit_row_change();
