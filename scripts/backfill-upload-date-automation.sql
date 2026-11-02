-- Optional one-time backfill. Review the dry-run first.
-- It uses the same trigger, so every changed item is logged in automation_runs.
insert into public.cell_values (
  id, organization_id, workspace_id, board_id, record_id, column_id,
  value, value_text, version, updated_at
)
select
  cv.board_id || ':' || cv.record_id || ':' || target.id,
  cv.organization_id, cv.workspace_id, cv.board_id, cv.record_id, target.id,
  to_jsonb(target.done_value), target.done_value, 1, now()
from public.cell_values cv
join public.columns upload on upload.id = cv.column_id
cross join lateral (
  select c.id,
    (
      select coalesce(nullif(e->>'id', ''), e->>'value', e->>'label')
      from jsonb_array_elements(
        case
          when jsonb_typeof(c.settings->'labels') = 'array' then c.settings->'labels'
          when jsonb_typeof(c.settings->'options') = 'array' then c.settings->'options'
          else '[]'::jsonb
        end
      ) e
      where lower(trim(coalesce(e->>'label', e->>'value', e #>> '{}'))) = 'done'
      limit 1
    ) as done_value
  from public.columns c
  where c.board_id = cv.board_id
    and c.deleted_at is null
    and lower(trim(c.label)) in ('status', 'tat', 'upload status')
) target
where lower(trim(upload.label)) = 'upload date'
  and nullif(btrim(cv.value_text), '') is not null
  and target.done_value is not null
  and target.done_value <> ''
  and not exists (
    select 1 from public.cell_values existing
    where existing.record_id = cv.record_id
      and existing.column_id = target.id
      and lower(trim(existing.value_text)) = 'done'
  )
on conflict (board_id, record_id, column_id) do nothing;
