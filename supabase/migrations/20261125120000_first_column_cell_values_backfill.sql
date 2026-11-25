-- First column is now stored in cell_values exactly like every other column.
-- One-time backfill: for each scope (board-level and each group), copy
-- records.title into cell_values for that scope's first column where the cell
-- is missing, so legacy rows keep their first-column value.
--
-- Apply manually in the Supabase dashboard SQL editor (newest file last).
-- Idempotent: safe to re-run; existing cells are never overwritten.

with first_col as (
  select distinct on (coalesce(group_id, ''))
    coalesce(group_id, '') as scope,
    id as column_id,
    board_id
  from public.columns
  where deleted_at is null
  order by coalesce(group_id, ''), sort_order asc, id asc
)
insert into public.cell_values
  (id, organization_id, workspace_id, board_id, record_id, column_id, value, value_text, version)
select
  fc.board_id || ':' || r.id || ':' || fc.column_id as id,
  r.organization_id,
  r.workspace_id,
  r.board_id,
  r.id as record_id,
  fc.column_id,
  to_jsonb(r.title) as value,
  r.title as value_text,
  1 as version
from public.records r
join first_col fc
  on fc.board_id = r.board_id
 and fc.scope = coalesce(r.group_id, '')
where r.title is not null
  and r.title <> ''
  and not exists (
    select 1 from public.cell_values cv
    where cv.record_id = r.id
      and cv.column_id = fc.column_id
  )
on conflict (id) do nothing;

do $$ begin
  raise notice 'first-column cell_values backfill complete';
end $$;