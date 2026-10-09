-- =============================================================================
-- Import Flow — Column Soft-Delete & Cleanup
-- 
-- Adds soft-delete support for columns so that unmapped columns during import
-- can be archived rather than hard-deleted, allowing recovery from trash.
-- Also adds cleanup functions for dependent objects (views, filters, sorts, etc.)
-- =============================================================================

-- ── 1. Add deleted_at to columns table ──────────────────────────────────
alter table public.columns add column if not exists deleted_at timestamptz;
create index if not exists columns_deleted_at_idx on public.columns (deleted_at);
create index if not exists columns_board_deleted_idx on public.columns (board_id, deleted_at) where deleted_at is null;

-- ── 2. Update column read queries to filter soft-deleted columns ─────────
-- This will be handled in the repository layer, but we add a view for convenience
create or replace view public.active_columns as
select *
from public.columns
where deleted_at is null;

-- ── 3. Function to soft-delete a column ─────────────────────────────────
create or replace function public.soft_delete_column(p_column_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_updated bigint;
  v_board_id text;
  v_workspace_id text;
begin
  if v_uid is null then
    raise exception 'rbac: you must be signed in to delete a column'
      using errcode = '42501';
  end if;

  -- Check permissions - user must be able to edit the board
  select c.board_id, b.workspace_id
    into v_board_id, v_workspace_id
    from public.columns c
    join public.boards b on b.id = c.board_id
   where c.id = p_column_id
     and c.deleted_at is null;

  if not found then
    return false;
  end if;

  -- Check if user can edit the workspace (which implies column edit rights)
  if not public.can_edit_workspace(v_workspace_id) then
    -- Fallback: check board-level edit permission
    if not public.can_edit_board(v_board_id) then
      raise exception 'rbac: you do not have permission to delete columns on this board'
        using errcode = '42501';
    end if;
  end if;

  -- Soft-delete the column
  update public.columns
     set deleted_at = now(),
         status = 'archived',
         updated_at = now()
   where id = p_column_id
     and deleted_at is null;

  get diagnostics v_updated = row_count;

  raise notice 'import: soft-deleted column % (rows affected: %)', p_column_id, v_updated;

  return v_updated > 0;
end
$$;

-- ── 4. Function to hard-delete a column (for purge/trash empty) ─────────
create or replace function public.hard_delete_column(p_column_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted bigint;
begin
  if v_uid is null then
    raise exception 'rbac: you must be signed in to hard delete a column'
      using errcode = '42501';
  end if;

  if not (public.is_service_role() or public.is_super_admin()) then
    raise exception 'rbac: only service role or super admin may hard delete columns'
      using errcode = '42501';
  end if;

  delete from public.columns
   where id = p_column_id;

  get diagnostics v_deleted = row_count;

  return v_deleted > 0;
end
$$;

-- ── 5. Function to restore a soft-deleted column ────────────────────────
create or replace function public.restore_column(p_column_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_updated bigint;
  v_board_id text;
  v_workspace_id text;
begin
  if v_uid is null then
    raise exception 'rbac: you must be signed in to restore a column'
      using errcode = '42501';
  end if;

  -- Check permissions
  select c.board_id, b.workspace_id
    into v_board_id, v_workspace_id
    from public.columns c
    join public.boards b on b.id = c.board_id
   where c.id = p_column_id
     and c.deleted_at is not null;

  if not found then
    return false;
  end if;

  if not public.can_edit_workspace(v_workspace_id) then
    if not public.can_edit_board(v_board_id) then
      raise exception 'rbac: you do not have permission to restore columns on this board'
        using errcode = '42501';
    end if;
  end if;

  update public.columns
     set deleted_at = null,
         status = 'active',
         updated_at = now()
   where id = p_column_id
     and deleted_at is not null;

  get diagnostics v_updated = row_count;

  raise notice 'import: restored column % (rows affected: %)', p_column_id, v_updated;

  return v_updated > 0;
end
$$;

-- ── 6. Cleanup dependent objects when a column is deleted ───────────────
-- This function removes/updates references to a deleted column in:
-- - views (visible_column_ids, column_widths, filters, sorting, grouping)
-- - cell_values (already cascades via FK)
-- - column_dependencies
-- - permissions
create or replace function public.cleanup_column_dependents(p_column_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_view record;
begin
  -- Clean up views: remove column from visible_column_ids, column_widths, filters, sorting, grouping
  for v_view in
    select id, visible_column_ids, column_widths, filters, sorting, grouping
    from public.views
    where board_id = (select board_id from public.columns where id = p_column_id)
      and (
        p_column_id = any(visible_column_ids)
        or p_column_id = any(select jsonb_object_keys(column_widths))
        or exists (
          select 1 from jsonb_array_elements(filters) as f(elem)
          where (f.elem ->> 'columnId') = p_column_id
        )
        or exists (
          select 1 from jsonb_array_elements(sorting) as s(elem)
          where (s.elem ->> 'columnId') = p_column_id
        )
        or exists (
          select 1 from jsonb_array_elements(grouping) as g(elem)
          where (g.elem ->> 'columnId') = p_column_id
        )
      )
  loop
    -- Remove from visible_column_ids
    update public.views
       set visible_column_ids = array_remove(visible_column_ids, p_column_id),
           column_widths = column_widths - p_column_id,
           filters = (
             select jsonb_agg(elem)
             from jsonb_array_elements(filters) as elem
             where (elem ->> 'columnId') <> p_column_id
           ),
           sorting = (
             select jsonb_agg(elem)
             from jsonb_array_elements(sorting) as elem
             where (elem ->> 'columnId') <> p_column_id
           ),
           grouping = (
             select jsonb_agg(elem)
             from jsonb_array_elements(grouping) as elem
             where (elem ->> 'columnId') <> p_column_id
           ),
           updated_at = now()
     where id = v_view.id;
  end loop;

  -- Clean up column_dependencies (both source and target)
  delete from public.column_dependencies
   where source_column_id = p_column_id
      or target_column_id = p_column_id;

  -- Clean up permissions scoped to this column
  delete from public.permissions
   where scope = 'column'
     and (permissions ->> 'columnId') = p_column_id;

  raise notice 'import: cleaned up dependents for column %', p_column_id;
end
$$;

-- ── 7. Function to check what depends on a column (for warnings) ────────
create or replace function public.get_column_dependents(p_column_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '{"views": [], "dependencies": [], "permissions": []}'::jsonb;
  v_view record;
  v_dep record;
begin
  -- Check views
  for v_view in
    select id, name, type,
           case when p_column_id = any(visible_column_ids) then 'visible' end as visible_ref,
           case when p_column_id = any(select jsonb_object_keys(column_widths)) then 'width' end as width_ref,
           case when exists (
             select 1 from jsonb_array_elements(filters) as f(elem)
             where (f.elem ->> 'columnId') = p_column_id
           ) then 'filter' end as filter_ref,
           case when exists (
             select 1 from jsonb_array_elements(sorting) as s(elem)
             where (s.elem ->> 'columnId') = p_column_id
           ) then 'sort' end as sort_ref,
           case when exists (
             select 1 from jsonb_array_elements(grouping) as g(elem)
             where (g.elem ->> 'columnId') = p_column_id
           ) then 'group' end as group_ref
    from public.views
    where board_id = (select board_id from public.columns where id = p_column_id)
      and (
        p_column_id = any(visible_column_ids)
        or p_column_id = any(select jsonb_object_keys(column_widths))
        or exists (
          select 1 from jsonb_array_elements(filters) as f(elem)
          where (f.elem ->> 'columnId') = p_column_id
        )
        or exists (
          select 1 from jsonb_array_elements(sorting) as s(elem)
          where (s.elem ->> 'columnId') = p_column_id
        )
        or exists (
          select 1 from jsonb_array_elements(grouping) as g(elem)
          where (g.elem ->> 'columnId') = p_column_id
        )
      )
  loop
    v_result := jsonb_set(
      v_result,
      '{views}',
      v_result -> 'views' || jsonb_build_object(
        'id', v_view.id,
        'name', v_view.name,
        'type', v_view.type,
        'references', jsonb_build_array(
          v_view.visible_ref, v_view.width_ref, v_view.filter_ref, v_view.sort_ref, v_view.group_ref
        ) - null
      )
    );
  end loop;

  -- Check column_dependencies
  for v_dep in
    select id, relation, source_column_id, target_column_id, target_board_id
    from public.column_dependencies
    where source_column_id = p_column_id
       or target_column_id = p_column_id
  loop
    v_result := jsonb_set(
      v_result,
      '{dependencies}',
      v_result -> 'dependencies' || jsonb_build_object(
        'id', v_dep.id,
        'relation', v_dep.relation,
        'source_column_id', v_dep.source_column_id,
        'target_column_id', v_dep.target_column_id,
        'target_board_id', v_dep.target_board_id
      )
    );
  end loop;

  -- Check permissions
  -- (simplified - permissions table structure may vary)

  return v_result;
end
$$;

-- ── 8. Grant execute permissions ────────────────────────────────────────
revoke all on function public.soft_delete_column(text) from public;
revoke all on function public.hard_delete_column(text) from public;
revoke all on function public.restore_column(text) from public;
revoke all on function public.cleanup_column_dependents(text) from public;
revoke all on function public.get_column_dependents(text) from public;

grant execute on function public.soft_delete_column(text) to authenticated, service_role;
grant execute on function public.hard_delete_column(text) to service_role;
grant execute on function public.restore_column(text) to authenticated, service_role;
grant execute on function public.cleanup_column_dependents(text) to authenticated, service_role;
grant execute on function public.get_column_dependents(text) to authenticated, service_role;

-- ── 9. Deployment diagnostics ───────────────────────────────────────────
do $$
begin
  raise notice 'import: columns table soft-delete enabled with deleted_at column';
  raise notice 'import: cleanup_column_dependents() and get_column_dependents() available';
end
$$;