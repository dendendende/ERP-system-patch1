-- P1-T6a: entries (our labels on bank transactions) and the rules engine.
--
-- bank_transactions never change; everything we *say* about a transaction lives in its entry.
-- Every new bank transaction gets exactly one entry, created by a trigger in the same DB
-- transaction as the insert — so sync and CSV import can't skip it, and a failed insert leaves
-- no orphan entry.

-- Lets rules and entries point at (category, direction) pairs, so a rule can't file money
-- that came in under a "went out" category.
alter table public.categories add unique (id, type);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  match_field text not null default 'description' check (match_field in ('description')),
  match_type text not null check (match_type in ('contains', 'equals', 'regex')),
  pattern text not null check (btrim(pattern) <> ''),
  direction text not null check (direction in ('in', 'out')),
  category_id uuid not null,
  is_recurring boolean not null default false,
  priority integer not null default 0, -- higher wins; ties go to the newest rule
  created_from_entry_id uuid, -- FK added below, once entries exists
  is_active boolean not null default true,
  -- clock_timestamp: two rules made in one transaction still get distinct, ordered times
  created_at timestamptz not null default clock_timestamp(),
  foreign key (category_id, direction) references public.categories (id, type) on delete restrict
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null unique references public.bank_transactions (id) on delete restrict,
  category_id uuid references public.categories (id) on delete restrict,
  customer_id uuid, -- FK to customers added in P2-T1
  invoice_id uuid, -- FK to invoices added in P2-T2
  is_recurring boolean not null default false,
  status text not null check (status in ('auto', 'labelled', 'needs_label')),
  note text not null default '',
  rule_id uuid references public.rules (id) on delete set null, -- which rule labelled it (P1-T11 counts)
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check ((category_id is null) = (status = 'needs_label'))
);

alter table public.rules
  add foreign key (created_from_entry_id) references public.entries (id) on delete set null;

create index entries_needs_label_idx on public.entries (status) where status = 'needs_label';
create index entries_category_idx on public.entries (category_id);

-- Invalid regex would make every later bank insert fail, so reject it when the rule is saved.
create or replace function public.rules_validate()
returns trigger
language plpgsql
as $$
begin
  if new.match_type = 'regex' then
    begin
      perform '' ~ new.pattern;
    exception when others then
      raise exception 'Rule pattern is not a valid regular expression: %', new.pattern
        using errcode = 'invalid_parameter_value';
    end;
  end if;
  return new;
end;
$$;

create trigger rules_validate
  before insert or update on public.rules
  for each row execute function public.rules_validate();

-- The best active rule for one transaction, or nothing.
create or replace function public.match_rule(p_direction text, p_description text)
returns public.rules
language sql
stable
set search_path = ''
as $$
  select r.*
    from public.rules r
   where r.is_active
     and r.direction = p_direction
     and case r.match_type
           when 'contains' then strpos(lower(p_description), lower(r.pattern)) > 0
           when 'equals' then lower(btrim(p_description)) = lower(btrim(r.pattern))
           when 'regex' then p_description ~* r.pattern
         end
   order by r.priority desc, r.created_at desc
   limit 1;
$$;

-- AFTER INSERT on bank_transactions: create the entry.
create or replace function public.create_entry_for_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rules;
begin
  r := public.match_rule(new.direction, new.description_raw);
  insert into public.entries (bank_transaction_id, category_id, is_recurring, status, rule_id)
  values (
    new.id,
    r.category_id,
    coalesce(r.is_recurring, false),
    case when r.id is null then 'needs_label' else 'auto' end,
    r.id
  );
  return null;
end;
$$;

revoke all on function public.create_entry_for_transaction() from public, anon, authenticated;

create trigger create_entry
  after insert on public.bank_transactions
  for each row execute function public.create_entry_for_transaction();

-- BEFORE UPDATE on entries: when a *person* edits (role authenticated), stamp who/when and
-- mark it labelled — the engine never overwrites a person's label. The category must match
-- the money's direction. Deliberately NOT security definer: current_user must stay the
-- caller's role (authenticated for people, the owner role inside engine functions).
create or replace function public.entries_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tx_direction text;
begin
  if new.category_id is not null and new.category_id is distinct from old.category_id then
    select t.direction into tx_direction
      from public.bank_transactions t where t.id = new.bank_transaction_id;
    if not exists (
      select 1 from public.categories c where c.id = new.category_id and c.type = tx_direction
    ) then
      raise exception 'Category does not match the direction of this money (%)', tx_direction
        using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  if current_user = 'authenticated' then
    new.updated_by := auth.uid();
    if new.category_id is distinct from old.category_id then
      new.status := case when new.category_id is null then 'needs_label' else 'labelled' end;
      new.rule_id := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger entries_before_update
  before update on public.entries
  for each row execute function public.entries_before_update();

-- Re-run rules over entries still waiting for a label (e.g. after adding a rule).
-- Never touches auto or labelled entries, so it is safe to run any number of times.
create or replace function public.apply_rules_to_unlabelled()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  labelled integer;
begin
  if public.current_app_role() not in ('owner', 'operator') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  update public.entries e
     set category_id = r.category_id, is_recurring = r.is_recurring, status = 'auto', rule_id = r.id
    from public.bank_transactions t
    cross join lateral public.match_rule(t.direction, t.description_raw) r
   where e.bank_transaction_id = t.id
     and e.status = 'needs_label'
     and r.id is not null;
  get diagnostics labelled = row_count;
  return labelled;
end;
$$;

revoke all on function public.apply_rules_to_unlabelled() from public, anon;
grant execute on function public.apply_rules_to_unlabelled() to authenticated;

-- RLS
alter table public.rules enable row level security;
alter table public.entries enable row level security;

revoke all on public.rules from anon, authenticated;
grant select, insert, update, delete on public.rules to authenticated;
create policy rules_select on public.rules
  for select to authenticated using (public.current_app_role() is not null);
-- operators create rules from the needs-label inbox ("label this way from now on")
create policy rules_insert on public.rules
  for insert to authenticated with check (public.current_app_role() in ('owner', 'operator'));
create policy rules_owner_update on public.rules
  for update to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');
create policy rules_owner_delete on public.rules
  for delete to authenticated using (public.current_app_role() = 'owner');

-- Entries are created only by the trigger; people can relabel but never insert or delete.
revoke all on public.entries from anon, authenticated;
grant select on public.entries to authenticated;
grant update (category_id, customer_id, invoice_id, is_recurring, note) on public.entries to authenticated;
create policy entries_select on public.entries
  for select to authenticated using (public.current_app_role() is not null);
create policy entries_update on public.entries
  for update to authenticated
  using (public.current_app_role() in ('owner', 'operator'))
  with check (public.current_app_role() in ('owner', 'operator'));

select public.enable_audit('public.rules');
-- Entries: audit changes only. Creation is fully determined by the bank row + rules, and
-- auditing every inserted entry would double the log for no information.
create trigger audit_row_change
  after update or delete on public.entries
  for each row execute function public.audit_row_change();

-- Entries for transactions that already exist.
insert into public.entries (bank_transaction_id, status)
select t.id, 'needs_label' from public.bank_transactions t;
