-- ────────────────────────────────────────────────────────────
-- Migration: RLS policies for core metadata tables
-- ────────────────────────────────────────────────────────────
--
-- Enforces board-level isolation for columns, records, cell_values,
-- views, groups, and other board-scoped tables. Without these policies,
-- any authenticated user could read/write data from any board in the
-- workspace, causing cross-board data leakage.
--
-- PRECEDENCE: run AFTER core metadata tables exist but BEFORE any
-- data-dependent migrations that assume RLS is in place.

-- ── 1. COLUMNS ──────────────────────────────────────────────
alter table public.columns enable row level security;

drop policy if exists "columns_select_board_member" on public.columns;;
create policy "columns_select_board_member" on public.columns
  for select
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      where b.id = columns.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "columns_insert_board_editor" on public.columns;;
create policy "columns_insert_board_editor" on public.columns
  for insert
  with check (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'column'
        and pg.action = 'create'
        and pg.effect = 'allow'
      where b.id = columns.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "columns_update_board_editor" on public.columns;;
create policy "columns_update_board_editor" on public.columns
  for update
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'column'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = columns.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "columns_delete_board_editor" on public.columns;;
create policy "columns_delete_board_editor" on public.columns
  for delete
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'column'
        and pg.action = 'delete'
        and pg.effect = 'allow'
      where b.id = columns.board_id
        and wm.user_id = auth.uid()
    )
  );

-- ── 2. RECORDS ──────────────────────────────────────────────
alter table public.records enable row level security;

drop policy if exists "records_select_board_member" on public.records;;
create policy "records_select_board_member" on public.records
  for select
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      where b.id = records.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "records_insert_board_editor" on public.records;;
create policy "records_insert_board_editor" on public.records
  for insert
  with check (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'create'
        and pg.effect = 'allow'
      where b.id = records.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "records_update_board_editor" on public.records;;
create policy "records_update_board_editor" on public.records
  for update
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = records.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "records_delete_board_editor" on public.records;;
create policy "records_delete_board_editor" on public.records
  for delete
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'delete'
        and pg.effect = 'allow'
      where b.id = records.board_id
        and wm.user_id = auth.uid()
    )
  );

-- ── 3. CELL_VALUES ──────────────────────────────────────────
alter table public.cell_values enable row level security;

drop policy if exists "cell_values_select_board_member" on public.cell_values;;
create policy "cell_values_select_board_member" on public.cell_values
  for select
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      where b.id = cell_values.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "cell_values_insert_board_editor" on public.cell_values;;
create policy "cell_values_insert_board_editor" on public.cell_values
  for insert
  with check (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = cell_values.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "cell_values_update_board_editor" on public.cell_values;;
create policy "cell_values_update_board_editor" on public.cell_values
  for update
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = cell_values.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "cell_values_delete_board_editor" on public.cell_values;;
create policy "cell_values_delete_board_editor" on public.cell_values
  for delete
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'delete'
        and pg.effect = 'allow'
      where b.id = cell_values.board_id
        and wm.user_id = auth.uid()
    )
  );

-- ── 4. VIEWS ────────────────────────────────────────────────
alter table public.views enable row level security;

drop policy if exists "views_select_board_member" on public.views;;
create policy "views_select_board_member" on public.views
  for select
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      where b.id = views.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "views_insert_board_editor" on public.views;;
create policy "views_insert_board_editor" on public.views
  for insert
  with check (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'view'
        and pg.action = 'create'
        and pg.effect = 'allow'
      where b.id = views.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "views_update_board_editor" on public.views;;
create policy "views_update_board_editor" on public.views
  for update
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'view'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = views.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "views_delete_board_editor" on public.views;;
create policy "views_delete_board_editor" on public.views
  for delete
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'view'
        and pg.action = 'delete'
        and pg.effect = 'allow'
      where b.id = views.board_id
        and wm.user_id = auth.uid()
    )
  );

-- ── 5. GROUPS ───────────────────────────────────────────────
alter table public.groups enable row level security;

drop policy if exists "groups_select_board_member" on public.groups;;
create policy "groups_select_board_member" on public.groups
  for select
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      where b.id = groups.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "groups_insert_board_editor" on public.groups;;
create policy "groups_insert_board_editor" on public.groups
  for insert
  with check (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'group'
        and pg.action = 'create'
        and pg.effect = 'allow'
      where b.id = groups.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "groups_update_board_editor" on public.groups;;
create policy "groups_update_board_editor" on public.groups
  for update
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'group'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = groups.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "groups_delete_board_editor" on public.groups;;
create policy "groups_delete_board_editor" on public.groups
  for delete
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'group'
        and pg.action = 'delete'
        and pg.effect = 'allow'
      where b.id = groups.board_id
        and wm.user_id = auth.uid()
    )
  );

-- ── 6. SEARCH_INDEX ─────────────────────────────────────────
alter table public.search_index enable row level security;

drop policy if exists "search_index_select_board_member" on public.search_index;;
create policy "search_index_select_board_member" on public.search_index
  for select
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      where b.id = search_index.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "search_index_insert_board_editor" on public.search_index;;
create policy "search_index_insert_board_editor" on public.search_index
  for insert
  with check (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = search_index.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "search_index_update_board_editor" on public.search_index;;
create policy "search_index_update_board_editor" on public.search_index
  for update
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'edit'
        and pg.effect = 'allow'
      where b.id = search_index.board_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "search_index_delete_board_editor" on public.search_index;;
create policy "search_index_delete_board_editor" on public.search_index
  for delete
  using (
    exists (
      select 1 from public.boards b
      inner join public.workspace_members wm on wm.workspace_id = b.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = 'record'
        and pg.action = 'delete'
        and pg.effect = 'allow'
      where b.id = search_index.board_id
        and wm.user_id = auth.uid()
    )
  );
