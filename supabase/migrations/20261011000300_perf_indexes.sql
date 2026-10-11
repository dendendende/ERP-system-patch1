-- P9-T7: what the timing at 50,000 bank rows found slow.

-- Notifications, "first payment to someone new": for each big payment out it looks for any
-- earlier payment out to the same payee. That read every payment out, 1.8s on every page (the
-- bell). An index on payee_pattern(description_raw) didn't help: under row-level security
-- Postgres won't use an index on a function it can't prove leaks nothing, and the regexes in it
-- don't qualify. So each row keeps its payee, worked out once by the database when the bank row
-- arrives (a generated column: never typed, never changed), and a plain text index serves it.
alter table public.bank_transactions
  add column payee text generated always as (public.payee_pattern(description_raw)) stored;

create index bank_transactions_out_payee_idx
  on public.bank_transactions (payee, occurred_at)
  where direction = 'out';

create or replace function public.notifications(
  p_days integer default 14,
  p_big bigint default 10000000
)
returns table (
  kind text,
  id uuid,
  at timestamptz,
  amount bigint,
  who text,
  detail text,
  link_id uuid,
  is_new boolean
)
language sql
stable
set search_path = ''
as $$
  with since as (select now() - make_interval(days => p_days) as at),
  seen as (
    select coalesce(
      (select s.seen_at from public.notification_seen s where s.user_id = auth.uid()),
      '-infinity'::timestamptz) as at
  )
  select n.kind, n.id, n.at, n.amount, n.who, n.detail, n.link_id, n.arrived > (select at from seen)
    from (
      select 'mismatch' as kind, b.id, b.created_at as at, b.difference as amount,
             a.bank_name || ' ••' || a.account_last4 as who, b.likely_cause as detail,
             a.id as link_id, b.created_at as arrived
        from public.balance_checks b
        join public.bank_accounts a on a.id = b.bank_account_id
       where b.status = 'mismatch' and b.created_at >= (select at from since)
      union all
      select 'failed_delivery', r.id, coalesce(r.claimed_at, r.scheduled_for), null,
             c.name, r.error, c.id, coalesce(r.claimed_at, r.scheduled_for)
        from public.reminders r
        join public.invoices i on i.id = r.invoice_id
        join public.customers c on c.id = i.customer_id
       where r.status = 'failed' and coalesce(r.claimed_at, r.scheduled_for) >= (select at from since)
      union all
      select 'new_payee', t.id, t.occurred_at, t.amount, t.description_raw, null, t.id,
             t.created_at
        from public.bank_transactions t
        join public.bank_accounts a on a.id = t.bank_account_id and a.is_active
       where t.direction = 'out'
         and t.amount >= p_big
         and t.occurred_at >= (select at from since)
         -- moving money between our own accounts, or a cancelled mistake, pays nobody
         and not exists (select 1 from public.entries e
                           join public.categories c on c.id = e.category_id
                          where e.bank_transaction_id = t.id and c.report_group = 'transfer')
         and not exists (select 1 from public.bank_transactions p
                          where p.direction = 'out' and p.occurred_at < t.occurred_at
                            and p.payee = t.payee)
    ) n
   order by n.at desc;
$$;

-- Metric history (sparklines, the forecast's month): a few metrics over a span of days.
-- The primary key starts with the day, so that read every metric of every day in the span.
create index metric_snapshots_metric_idx on public.metric_snapshots (metric, taken_on);

-- Money in & out: money_list() is the whole filtered list; the page asks it for 500 rows in an
-- order. A function with its own search_path is never inlined, so Postgres built all 50,000
-- rows and then sorted them (170ms a page). Without it, the page's order and limit reach the
-- tables and the date index serves them (5ms). Safe: it runs with the reader's own rights
-- (security invoker) and names every table and function with its schema, so a search_path the
-- caller sets can't change what it reads — at most the caller fools themselves.
alter function public.money_list(date, date, text, uuid, text, uuid, bigint, bigint, text)
  reset search_path;

-- The needs-a-label inbox suggests categories by how similar each one's labelled bank
-- descriptions are. That compared the description with every labelled row, for each row in
-- the inbox: 760ms on every Money in & out page. Now a trigram index finds, per category, its
-- single most similar description (nearest first, so the first one found is the best) — the
-- same suggestions and scores as before (checked on 341 descriptions), 120ms for the inbox.
-- ponytail: a category whose labels all read nothing like the description walks much of the
-- index before its best match turns up; still bounded, add a similarity floor if that bites.
create index bank_transactions_description_trgm_idx
  on public.bank_transactions using gist (description_raw extensions.gist_trgm_ops);

create or replace function public.suggest_categories(p_direction text, p_description text)
returns table (category_id uuid, name text, score real)
language sql
stable
set search_path = ''
as $$
  with history as (
    select c.id as category_id, c.name, c.is_system, c.report_group,
           (select extensions.similarity(t.description_raw, p_description)
              from public.entries e
              join public.bank_transactions t on t.id = e.bank_transaction_id
             where e.category_id = c.id and e.status in ('labelled', 'auto')
             order by t.description_raw operator(extensions.<->) p_description
             limit 1) as similarity,
           -- how often it's used, counted up to 10 (all the score uses)
           (select count(*) from (select 1 from public.entries u
                                   where u.category_id = c.id and u.status in ('labelled', 'auto')
                                   limit 10) x) as uses
      from public.categories c
     where c.type = p_direction
  )
  -- used before: similarity + a little for use; never used: only the built-in ones, at 0
  select h.category_id, h.name,
         case when h.uses > 0 then (h.similarity + h.uses::real / 100)::real else 0::real end
    from history h
   where h.uses > 0 or (h.is_system and h.report_group <> 'transfer')
   order by 3 desc, h.name
   limit 3;
$$;
