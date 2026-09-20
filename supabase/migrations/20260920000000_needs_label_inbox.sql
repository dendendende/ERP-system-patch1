-- P1-T8: the needs-label inbox — what to show, and which categories to suggest.

create extension if not exists pg_trgm with schema extensions;

-- Suggestions come from what the team already labelled: categories used on similar bank
-- descriptions rank first, a little weight for how often the category is used at all.
-- With no history yet (first weeks), fall back to the built-in categories.
create or replace function public.suggest_categories(p_direction text, p_description text)
returns table (category_id uuid, name text, score real)
language sql
stable
set search_path = ''
as $$
  with history as (
    select e.category_id,
           max(extensions.similarity(t.description_raw, p_description)) as similarity,
           count(*) as uses
      from public.entries e
      join public.bank_transactions t on t.id = e.bank_transaction_id
      join public.categories c on c.id = e.category_id
     where e.status in ('labelled', 'auto')
       and c.type = p_direction
     group by e.category_id
  ),
  scored as (
    select h.category_id, (h.similarity + least(h.uses, 10)::real / 100)::real as score
      from history h
    union all
    select c.id, 0::real
      from public.categories c
     where c.type = p_direction and c.is_system and c.report_group <> 'transfer'
  )
  select s.category_id, c.name, max(s.score)::real as score
    from scored s
    join public.categories c on c.id = s.category_id
   group by s.category_id, c.name
   order by score desc, c.name
   limit 3;
$$;

grant execute on function public.suggest_categories(text, text) to authenticated;

-- Oldest first: the longest-waiting transactions get labelled first.
create or replace function public.needs_label_inbox(p_limit integer default 5)
returns table (
  entry_id uuid,
  description text,
  amount text,
  direction text,
  occurred_at timestamptz,
  account text,
  suggestions jsonb
)
language sql
stable
set search_path = ''
as $$
  select e.id,
         t.description_raw,
         t.amount::text,
         t.direction,
         t.occurred_at,
         a.bank_name || ' ••' || a.account_last4,
         coalesce(
           (select jsonb_agg(jsonb_build_object('id', s.category_id, 'name', s.name))
              from public.suggest_categories(t.direction, t.description_raw) s),
           '[]'::jsonb
         )
    from public.entries e
    join public.bank_transactions t on t.id = e.bank_transaction_id
    join public.bank_accounts a on a.id = t.bank_account_id
   where e.status = 'needs_label'
   order by t.occurred_at asc
   limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.needs_label_inbox(integer) to authenticated;
