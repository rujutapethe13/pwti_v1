-- Read-only preview of every board and exact-named column affected by the rule.
select
  b.workspace_id,
  b.id as board_id,
  b.name as board_name,
  max(case when lower(trim(c.label)) = 'upload date' then c.id end) as upload_date_column_id,
  array_agg(c.id order by c.label)
    filter (where lower(trim(c.label)) in ('status', 'tat', 'upload status')) as target_column_ids,
  array_agg(c.label order by c.label)
    filter (where lower(trim(c.label)) in ('status', 'tat', 'upload status')) as target_column_names
from public.boards b
left join public.columns c on c.board_id = b.id and c.deleted_at is null
group by b.workspace_id, b.id, b.name
having bool_or(lower(trim(c.label)) = 'upload date')
    or bool_or(lower(trim(c.label)) in ('status', 'tat', 'upload status'))
order by b.workspace_id, b.name;
