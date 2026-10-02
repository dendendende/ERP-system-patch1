-- P5-T5: what came in and went out between two days (own transfers left out), for the weekly
-- summary. Everything else in the summary comes from views that already exist.

create or replace function public.came_in_went_out(p_from date, p_to date)
returns table (came_in bigint, went_out bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount) filter (where direction = 'in'), 0)::bigint,
         coalesce(sum(amount) filter (where direction = 'out'), 0)::bigint
    from public.money_moves
   where day between p_from and p_to;
$$;

grant execute on function public.came_in_went_out(date, date) to authenticated;
