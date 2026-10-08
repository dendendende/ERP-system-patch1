-- Money in & out v2 (analytical list). ONE definition of "which transactions match these
-- filters": the list, its totals, its charts and its CSV export all read from money_list(), so
-- the numbers on screen always describe exactly the rows below them. Runs with the reader's
-- rights (RLS applies). Dates are Asia/Jakarta days.

create or replace function public.money_list(
  p_from date default null,
  p_to date default null,
  p_direction text default null,  -- 'in' | 'out'
  p_category uuid default null,
  p_status text default null,     -- 'needs_label' | 'labelled' | 'matched'
  p_account uuid default null,
  p_min bigint default null,      -- whole rupiah, inclusive
  p_max bigint default null,
  p_q text default null           -- part of the bank's description
)
returns table (
  id uuid,
  occurred_at timestamptz,
  day date,
  amount bigint,
  direction text,
  description text,
  account_id uuid,
  account text,
  category_id uuid,
  category text,
  is_own_transfer boolean,
  status text,
  invoice_id uuid,
  invoice_number text
)
language sql
stable
set search_path = ''
as $$
  select t.id,
         t.occurred_at,
         (t.occurred_at at time zone 'Asia/Jakarta')::date,
         t.amount,
         t.direction,
         t.description_raw,
         a.id,
         a.bank_name || ' ••' || a.account_last4,
         c.id,
         c.name,
         coalesce(c.report_group = 'transfer', false),
         e.status,
         e.invoice_id,
         i.number
    from public.bank_transactions t
    join public.entries e on e.bank_transaction_id = t.id
    join public.bank_accounts a on a.id = t.bank_account_id
    left join public.categories c on c.id = e.category_id
    left join public.invoices i on i.id = e.invoice_id
   where (p_from is null or t.occurred_at >= (p_from::timestamp at time zone 'Asia/Jakarta'))
     and (p_to is null or t.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
     and (p_direction is null or t.direction = p_direction)
     and (p_category is null or e.category_id = p_category)
     and (p_status is null
          or (p_status = 'needs_label' and e.status = 'needs_label')
          or (p_status = 'labelled' and e.status <> 'needs_label')
          or (p_status = 'matched' and e.invoice_id is not null))
     and (p_account is null or t.bank_account_id = p_account)
     and (p_min is null or t.amount >= p_min)
     and (p_max is null or t.amount <= p_max)
     and (p_q is null or t.description_raw ilike '%' || p_q || '%');
$$;

-- Totals and chart data for the same filtered rows. Money moved between own accounts is listed
-- but left out of every total, like everywhere else in the app. Amounts as text: JSON numbers
-- lose precision above 2^53.
create or replace function public.money_list_summary(
  p_from date default null,
  p_to date default null,
  p_direction text default null,
  p_category uuid default null,
  p_status text default null,
  p_account uuid default null,
  p_min bigint default null,
  p_max bigint default null,
  p_q text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (
    select * from public.money_list(p_from, p_to, p_direction, p_category, p_status, p_account,
                                    p_min, p_max, p_q)
  ),
  counted as (select * from r where not is_own_transfer)
  select jsonb_build_object(
    'count', (select count(*) from r),
    'came_in', (select coalesce(sum(amount) filter (where direction = 'in'), 0)::text from counted),
    'went_out', (select coalesce(sum(amount) filter (where direction = 'out'), 0)::text from counted),
    -- the latest 12 months that have rows
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'came_in', m.came_in::text,
                                          'went_out', m.went_out::text) order by m.month)
        from (select date_trunc('month', day)::date as month,
                     coalesce(sum(amount) filter (where direction = 'in'), 0) as came_in,
                     coalesce(sum(amount) filter (where direction = 'out'), 0) as went_out
                from counted group by 1 order by 1 desc limit 12) m
    ), '[]'::jsonb),
    -- where the money went / came from: the 6 biggest categories (unlabelled counts as one)
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', k.category_id, 'category', k.category,
                                          'direction', k.direction, 'total', k.total::text,
                                          'count', k.n) order by k.total desc)
        from (select category_id, coalesce(category, 'Needs a label') as category, direction,
                     sum(amount) as total, count(*) as n
                from counted group by 1, 2, 3 order by 4 desc limit 6) k
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.money_list(date, date, text, uuid, text, uuid, bigint, bigint, text)
  from public, anon;
revoke all on function public.money_list_summary(date, date, text, uuid, text, uuid, bigint, bigint, text)
  from public, anon;
grant execute on function public.money_list(date, date, text, uuid, text, uuid, bigint, bigint, text)
  to authenticated;
grant execute on function public.money_list_summary(date, date, text, uuid, text, uuid, bigint, bigint, text)
  to authenticated;

