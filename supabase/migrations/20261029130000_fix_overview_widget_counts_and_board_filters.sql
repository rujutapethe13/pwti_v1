-- Overview widgets aggregate at record grain. A snapshot row represents one
-- board record; volume is the row count, not a sum over cell/column values.

drop function if exists public.overview_volume_breakdown(text, date, date);

create or replace function public.overview_volume_breakdown(
  p_organization_id text,
  p_board_ids uuid[],
  p_from date,
  p_to date
) returns jsonb
language sql stable security definer set search_path = public
as $$
  with item_rows as (
    select distinct s.record_id, s.board_id, coalesce(nullif(btrim(s.job_type), ''), '') as job_type
    from public.client_360_daily_snapshot s
    join public.boards b on b.id = s.board_id
    where s.organization_id = p_organization_id
      and s.job_date between p_from and p_to
      and b.status <> 'archived'
      and (p_board_ids is null or s.board_id in (select value::text from unnest(p_board_ids) value))
  ), grouped as (
    select job_type, count(*)::int as jobs from item_rows group by job_type
  )
  select jsonb_build_object(
    'total_volume', (select count(*)::int from item_rows),
    'total_jobs', (select count(*)::int from item_rows),
    'job_type_available', exists (
      select 1 from public.client_360_field_mappings
      where organization_id = p_organization_id and field_type = 'job_type'
    ),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'key', job_type, 'volume', jobs, 'jobs', jobs
    ) order by jobs desc, job_type asc) from grouped), '[]'::jsonb)
  );
$$;

create or replace function public.overview_workload_by_board(
  p_organization_id text,
  p_board_ids uuid[],
  p_from date,
  p_to date
) returns table(board_id text, board_name text, jobs int, percentage int)
language sql stable security definer set search_path = public
as $$
  with item_rows as (
    select distinct s.record_id, s.board_id
    from public.client_360_daily_snapshot s
    join public.boards b on b.id = s.board_id
    where s.organization_id = p_organization_id
      and s.job_date between p_from and p_to
      and b.status <> 'archived'
      and (p_board_ids is null or s.board_id in (select value::text from unnest(p_board_ids) value))
  ), grouped as (
    select board_id, count(*)::int as jobs from item_rows group by board_id
  ), totals as (select coalesce(sum(jobs), 0)::numeric as total from grouped)
  select g.board_id, b.name, g.jobs,
    case when t.total = 0 then 0 else round(g.jobs * 100 / t.total)::int end
  from grouped g
  join public.boards b on b.id = g.board_id
  cross join totals t
  order by b.name;
$$;

grant execute on function public.overview_volume_breakdown(text, uuid[], date, date) to authenticated, service_role;
grant execute on function public.overview_workload_by_board(text, uuid[], date, date) to authenticated, service_role;
