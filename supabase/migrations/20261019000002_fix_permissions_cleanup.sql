create or replace function public.cleanup_column_dependents(p_column_id text)
returns void
language plpgsql
security definer
set search_path = ''
as \$\$
declare
  v_view record;
begin
  for v_view in
    select id, visible_column_ids, column_widths, filters, sorting, grouping
    from public.views
    where board_id = (select board_id from public.columns where id = p_column_id)
      and (
        p_column_id = any(visible_column_ids)
        or p_column_id = any(select jsonb_object_keys(column_widths))
        or exists (select 1 from jsonb_array_elements(filters) as f(elem) where (f.elem ->> 'columnId') = p_column_id)
        or exists (select 1 from jsonb_array_elements(sorting) as s(elem) where (s.elem ->> 'columnId') = p_column_id)
        or exists (select 1 from jsonb_array_elements(grouping) as g(elem) where (g.elem ->> 'columnId') = p_column_id)
      )
  loop
    update public.views
       set visible_column_ids = array_remove(visible_column_ids, p_column_id),
           column_widths = column_widths - p_column_id,
           filters = coalesce((select jsonb_agg(elem) from jsonb_array_elements(filters) as elem where (elem ->> 'columnId') <> p_column_id), '[]'::jsonb),
           sorting = coalesce((select jsonb_agg(elem) from jsonb_array_elements(sorting) as elem where (elem ->> 'columnId') <> p_column_id), '[]'::jsonb),
           grouping = coalesce((select jsonb_agg(elem) from jsonb_array_elements(grouping) as elem where (elem ->> 'columnId') <> p_column_id), '[]'::jsonb),
           updated_at = now()
     where id = v_view.id;
  end loop;

  delete from public.column_dependencies
   where source_column_id = p_column_id
      or target_column_id = p_column_id;

  delete from public.permissions
   where scope = 'column'
     and subject = p_column_id;

  raise notice 'import: cleaned up dependents for column %', p_column_id;
end
\$\$;
