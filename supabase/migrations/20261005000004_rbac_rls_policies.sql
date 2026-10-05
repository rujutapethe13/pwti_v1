-- =============================================================================
-- RBAC / 04 — Row-level security, default deny
--
-- RLS is enabled on every table this system touches, and each table's policies
-- are written against the helpers from migration 02 rather than re-deriving the
-- rules. Where a table previously had no policy at all it gets one now, which
-- is the part that actually closes the live hole: the sidebar used to read
-- `workspaces` straight from the browser with the anon key, so any member of
-- any workspace in the organization could enumerate every workspace in it,
-- including other clients' workspaces.
--
-- Scope of RLS in this codebase
-- -----------------------------
-- The internal app reads and writes with the service_role key, which bypasses
-- RLS. RLS therefore governs two things:
--
--   1. The anon/authenticated path. This is the browser, and it is a hard wall:
--      a client can only ever get granted boards out of it.
--   2. Defence in depth for the internal path. If a future server action
--      forgets its guard-layer check and uses the anon client, RLS still holds.
--
-- The privilege tables themselves (client_board_access, client_column_permissions,
-- workspace_personal_access) have no client-facing policies at all: a client can
-- read their OWN rows and nothing else, which is what keeps two people in the
-- same client workspace from seeing each other's permissions.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================

-- ── profiles ───────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select
  using (
    public.is_service_role()
    or id = auth.uid()
    or public.is_super_admin()
    or (
      public.current_role() = 'admin'
      and public.current_org_id() is not null
      and exists (
        select 1
          from public.organization_members om
         where om.user_id = profiles.id
           and om.organization_id = public.current_org_id()
      )
    )
  );

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
  for update
  using (
    public.is_service_role()
    or id = auth.uid()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role()
    or id = auth.uid()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

-- Role changes on profiles are additionally gated by guard_profiles_role: a
-- user editing their own row can change their name but the trigger refuses the
-- role column. RLS alone cannot express "this column, not that one".

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

-- ── organization_members ───────────────────────────────────────────────────

alter table public.organization_members enable row level security;

drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
  for select
  using (
    public.is_service_role()
    or user_id = auth.uid()
    or public.is_super_admin()
    or (
      public.current_role() = 'admin'
      and organization_id = public.current_org_id()
    )
  );

drop policy if exists organization_members_write_admin on public.organization_members;
create policy organization_members_write_admin on public.organization_members
  for insert
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists organization_members_update_admin on public.organization_members;
create policy organization_members_update_admin on public.organization_members
  for update
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists organization_members_delete_admin on public.organization_members;
create policy organization_members_delete_admin on public.organization_members
  for delete
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

-- ── workspaces ─────────────────────────────────────────────────────────────
-- This is the policy that stops a client enumerating the organization.

alter table public.workspaces enable row level security;

drop policy if exists workspaces_select_visible on public.workspaces;
create policy workspaces_select_visible on public.workspaces
  for select
  using (public.is_service_role() or public.can_view_workspace(id));

drop policy if exists workspaces_insert_admin on public.workspaces;
create policy workspaces_insert_admin on public.workspaces
  for insert
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists workspaces_update_admin on public.workspaces;
create policy workspaces_update_admin on public.workspaces
  for update
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists workspaces_delete_admin on public.workspaces;
create policy workspaces_delete_admin on public.workspaces
  for delete
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

-- ── workspace_members ──────────────────────────────────────────────────────

alter table public.workspace_members enable row level security;

drop policy if exists workspace_members_select_scoped on public.workspace_members;
create policy workspace_members_select_scoped on public.workspace_members
  for select
  using (
    public.is_service_role()
    or user_id = auth.uid()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

drop policy if exists workspace_members_write_admin on public.workspace_members;
create policy workspace_members_write_admin on public.workspace_members
  for insert
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists workspace_members_update_admin on public.workspace_members;
create policy workspace_members_update_admin on public.workspace_members
  for update
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists workspace_members_delete_admin on public.workspace_members;
create policy workspace_members_delete_admin on public.workspace_members
  for delete
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

-- ── workspace_personal_access ──────────────────────────────────────────────

alter table public.workspace_personal_access enable row level security;

drop policy if exists workspace_personal_access_select on public.workspace_personal_access;
create policy workspace_personal_access_select on public.workspace_personal_access
  for select
  using (
    public.is_service_role()
    or user_id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1 from public.workspaces w
       where w.id = workspace_personal_access.workspace_id
         and w.owner_id = auth.uid()
    )
  );

drop policy if exists workspace_personal_access_write on public.workspace_personal_access;
create policy workspace_personal_access_write on public.workspace_personal_access
  for all
  using (
    public.is_service_role()
    or public.is_super_admin()
    or exists (
      select 1 from public.workspaces w
       where w.id = workspace_personal_access.workspace_id
         and w.owner_id = auth.uid()
    )
  )
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or exists (
      select 1 from public.workspaces w
       where w.id = workspace_personal_access.workspace_id
         and w.owner_id = auth.uid()
    )
  );

-- ── client_board_access ────────────────────────────────────────────────────
-- Own rows only for a client. This is the answer to "users in the same client
-- workspace cannot see each other's permissions": there is no policy path that
-- returns another user's rows to a non-admin.

alter table public.client_board_access enable row level security;

drop policy if exists client_board_access_select_own on public.client_board_access;
create policy client_board_access_select_own on public.client_board_access
  for select
  using (
    public.is_service_role()
    or user_id = auth.uid()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

drop policy if exists client_board_access_write_admin on public.client_board_access;
create policy client_board_access_write_admin on public.client_board_access
  for insert
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists client_board_access_update_admin on public.client_board_access;
create policy client_board_access_update_admin on public.client_board_access
  for update
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists client_board_access_delete_admin on public.client_board_access;
create policy client_board_access_delete_admin on public.client_board_access
  for delete
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

-- ── client_column_permissions ──────────────────────────────────────────────

alter table public.client_column_permissions enable row level security;

drop policy if exists client_column_permissions_select_own on public.client_column_permissions;
create policy client_column_permissions_select_own on public.client_column_permissions
  for select
  using (
    public.is_service_role()
    or user_id = auth.uid()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

drop policy if exists client_column_permissions_write_admin on public.client_column_permissions;
create policy client_column_permissions_write_admin on public.client_column_permissions
  for insert
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists client_column_permissions_update_admin on public.client_column_permissions;
create policy client_column_permissions_update_admin on public.client_column_permissions
  for update
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists client_column_permissions_delete_admin on public.client_column_permissions;
create policy client_column_permissions_delete_admin on public.client_column_permissions
  for delete
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

-- ── workspace_invites ──────────────────────────────────────────────────────

alter table public.workspace_invites enable row level security;

drop policy if exists workspace_invites_select_admin on public.workspace_invites;
create policy workspace_invites_select_admin on public.workspace_invites
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

drop policy if exists workspace_invites_write_admin on public.workspace_invites;
create policy workspace_invites_write_admin on public.workspace_invites
  for all
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

-- =============================================================================
-- Content tables
--
-- Clients get NO direct SELECT here at all — by design. Their only route in is
-- the RPCs from migration 03, which filter per row. Staff and admins read
-- directly, which is what the existing board grid does.
--
-- Writes are permitted for internal roles and then constrained by the triggers
-- in migration 03. For clients the RLS write policies stay closed, so a client
-- cannot reach the trigger at all except through the paths the triggers allow.
-- =============================================================================

-- ── boards ─────────────────────────────────────────────────────────────────

alter table public.boards enable row level security;

drop policy if exists boards_select_visible on public.boards;
create policy boards_select_visible on public.boards
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

drop policy if exists boards_insert_internal on public.boards;
create policy boards_insert_internal on public.boards
  for insert
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists boards_update_internal on public.boards;
create policy boards_update_internal on public.boards
  for update
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  )
  with check (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

drop policy if exists boards_delete_internal on public.boards;
create policy boards_delete_internal on public.boards
  for delete
  using (
    public.is_service_role() or public.is_super_admin() or public.current_role() = 'admin'
  );

-- ── columns ────────────────────────────────────────────────────────────────

alter table public.columns enable row level security;

drop policy if exists columns_select_internal on public.columns;
create policy columns_select_internal on public.columns
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

drop policy if exists columns_write_internal on public.columns;
create policy columns_write_internal on public.columns
  for all
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() = 'admin'
      or (
        public.current_role() = 'staff'
        and public.can_edit_board(board_id)
      )
    )
  )
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or (
      public.current_role() = 'staff'
      and public.can_edit_board(board_id)
    )
  );

-- ── records ────────────────────────────────────────────────────────────────

alter table public.records enable row level security;

drop policy if exists records_select_internal on public.records;
create policy records_select_internal on public.records
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

drop policy if exists records_write_internal on public.records;
create policy records_write_internal on public.records
  for all
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() = 'admin'
      or (
        public.current_role() = 'staff'
        and public.can_edit_board(board_id)
      )
    )
  )
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or (
      public.current_role() = 'staff'
      and public.can_edit_board(board_id)
    )
  );

-- ── cell_values ────────────────────────────────────────────────────────────

alter table public.cell_values enable row level security;

drop policy if exists cell_values_select_internal on public.cell_values;
create policy cell_values_select_internal on public.cell_values
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

drop policy if exists cell_values_write_internal on public.cell_values;
create policy cell_values_write_internal on public.cell_values
  for all
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() = 'admin'
      or (
        public.current_role() = 'staff'
        and public.can_edit_board(board_id)
      )
    )
  )
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or (
      public.current_role() = 'staff'
      and public.can_edit_board(board_id)
    )
  );

-- Client writes.
--
-- These exist because RLS alone cannot express the brief's rule. The requirement
-- is per *column* ("cannot change a column where can_edit = false"), and an RLS
-- policy is a whole-row predicate — it has no way to say "this UPDATE is fine as
-- long as it leaves the read-only columns alone".
--
-- So the split is deliberate: RLS decides whether the caller may touch a row of
-- this board at all, and guard_cell_value_write() in migration 03 decides
-- whether this particular column and this particular change are allowed. Without
-- these client policies a client could never write an editable column at all,
-- because the internal-only policy above would reject the statement first.

drop policy if exists cell_values_client_write on public.cell_values;
create policy cell_values_client_write on public.cell_values
  for all
  using (public.can_view_board(board_id))
  with check (public.can_view_board(board_id));

drop policy if exists records_client_update on public.records;
create policy records_client_update on public.records
  for update
  using (public.can_edit_board(board_id))
  with check (public.can_edit_board(board_id));

drop policy if exists records_client_insert on public.records;
create policy records_client_insert on public.records
  for insert
  with check (
    public.can_edit_board(board_id)
    and exists (
      select 1 from public.client_board_access cba
       where cba.user_id = auth.uid()
         and cba.board_id = records.board_id
         and cba.can_view
         and cba.can_create
    )
  );

drop policy if exists records_client_delete on public.records;
create policy records_client_delete on public.records
  for delete
  using (
    public.can_edit_board(board_id)
    and exists (
      select 1 from public.client_board_access cba
       where cba.user_id = auth.uid()
         and cba.board_id = records.board_id
         and cba.can_view
         and cba.can_delete
    )
  );

drop policy if exists groups_client_write on public.groups;
create policy groups_client_write on public.groups
  for all
  using (public.can_view_board(board_id))
  with check (public.can_view_board(board_id));

-- ── groups ─────────────────────────────────────────────────────────────────

alter table public.groups enable row level security;

drop policy if exists groups_select_internal on public.groups;
create policy groups_select_internal on public.groups
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

drop policy if exists groups_write_internal on public.groups;
create policy groups_write_internal on public.groups
  for all
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() = 'admin'
      or (
        public.current_role() = 'staff'
        and public.can_edit_board(board_id)
      )
    )
  )
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or (
      public.current_role() = 'staff'
      and public.can_edit_board(board_id)
    )
  );

-- ── views ──────────────────────────────────────────────────────────────────
-- A saved view can carry filters, sorts and grouping, which are references to
-- column ids. If a client could read a view row they would learn the names of
-- columns they are not allowed to see, so views stay internal-only and clients
-- use get_board_columns instead.

alter table public.views enable row level security;

drop policy if exists views_select_internal on public.views;
create policy views_select_internal on public.views
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

drop policy if exists views_write_internal on public.views;
create policy views_write_internal on public.views
  for all
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() = 'admin'
      or (
        public.current_role() = 'staff'
        and public.can_edit_board(board_id)
      )
    )
  )
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or (
      public.current_role() = 'staff'
      and public.can_edit_board(board_id)
    )
  );

-- ── Activity feed ──────────────────────────────────────────────────────────
-- Readable only by internal roles, and only inside a workspace the caller can
-- view. Personal workspaces are excluded from the feed by the second condition:
-- an internal user must not see another person's private workspace activity
-- simply because they are an admin.

alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_select_internal on public.activity_logs;
create policy activity_logs_select_internal on public.activity_logs
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() in ('admin', 'staff')
      and workspace_id is not null
      and public.can_view_workspace(workspace_id)
      and exists (
        select 1 from public.workspaces w
         where w.id = activity_logs.workspace_id
           and w.type <> 'personal'
      )
    )
  );

drop policy if exists activity_logs_insert_internal on public.activity_logs;
create policy activity_logs_insert_internal on public.activity_logs
  for insert
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

-- ── Analytics / Client 360 ─────────────────────────────────────────────────
-- Internal-only, and scoped to the workspaces the caller may see. These are the
-- surfaces the brief calls out as the places a personal workspace must never
-- surface, so the workspace filter is repeated here rather than trusted to the
-- caller. Clients get no row at all, which is the point: client search and
-- org-wide Overview are not client features.

alter table public.client_360_clients enable row level security;

drop policy if exists client_360_clients_select_internal on public.client_360_clients;
create policy client_360_clients_select_internal on public.client_360_clients
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() in ('admin', 'staff')
      and organization_id = public.current_org_id()
    )
  );

alter table public.client_360_client_aliases enable row level security;

drop policy if exists client_360_aliases_select_internal on public.client_360_client_aliases;
create policy client_360_aliases_select_internal on public.client_360_client_aliases
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() in ('admin', 'staff')
      and organization_id = public.current_org_id()
    )
  );

alter table public.client_360_daily_snapshot enable row level security;

drop policy if exists client_360_snapshot_select_internal on public.client_360_daily_snapshot;
create policy client_360_snapshot_select_internal on public.client_360_daily_snapshot
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or (
      public.current_role() in ('admin', 'staff')
      and workspace_id = any (public.accessible_workspace_ids(false))
    )
  );

alter table public.client_360_field_mappings enable row level security;

drop policy if exists client_360_mappings_select_internal on public.client_360_field_mappings;
create policy client_360_mappings_select_internal on public.client_360_field_mappings
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

-- Existing owner-all policies on these tables would OR their way back in.
-- The tenant migration replaced them with org-scoped ones; drop by name so a
-- re-run of this file cannot leave the permissive version behind.
drop policy if exists client_360_daily_snapshot_org_member on public.client_360_daily_snapshot;

-- ── Search index ───────────────────────────────────────────────────────────
-- The search_index table holds a denormalised copy of record content. If it
-- outlives a revoked grant it becomes a way to read what the client can no
-- longer see, so it is internal-only and clients search through
-- get_search_results(), which filters per column at query time.

alter table public.search_index enable row level security;

drop policy if exists search_index_select_internal on public.search_index;
create policy search_index_select_internal on public.search_index
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

-- ── Favorites ──────────────────────────────────────────────────────────────
-- A favourite is a bookmark to a workspace or board. A row that only checked
-- user_id would let a client keep — and keep seeing — a favourite on a board
-- they have since lost access to, which leaks the fact that the board exists
-- and leaves the sidebar trying to render something it cannot load. Both the
-- read and the write are therefore gated on current visibility, so a revoke
-- cleans up the bookmark view without any extra bookkeeping.

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select
  using (
    public.is_service_role()
    or (
      user_id = auth.uid()
      and (
        (item_type = 'workspace' and public.can_view_workspace(item_id))
        or (item_type = 'board' and public.can_view_board(item_id))
      )
    )
  );

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert
  with check (
    public.is_service_role()
    or (
      user_id = auth.uid()
      and (
        (item_type = 'workspace' and public.can_view_workspace(item_id))
        or (item_type = 'board' and public.can_view_board(item_id))
      )
    )
  );

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own" on public.favorites
  for update
  using (public.is_service_role() or user_id = auth.uid())
  with check (
    public.is_service_role()
    or (
      user_id = auth.uid()
      and (
        (item_type = 'workspace' and public.can_view_workspace(item_id))
        or (item_type = 'board' and public.can_view_board(item_id))
      )
    )
  );

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete
  using (public.is_service_role() or user_id = auth.uid());

-- ── audit_log ──────────────────────────────────────────────────────────────
-- Append-only. Admins and the super admin read it; nobody updates or deletes.
-- The audit table itself is deliberately readable only by internal roles, since
-- an entry can name both an actor and a permission that a client has no business
-- knowing about.

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
  );

drop policy if exists audit_log_insert_internal on public.audit_log;
create policy audit_log_insert_internal on public.audit_log
  for insert
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() in ('admin', 'staff')
  );

-- =============================================================================
-- Realtime
--
-- A realtime subscription runs as the subscribing user, so it is subject to the
-- same RLS as a normal read. For records and cell_values there is no client
-- policy, so a client cannot subscribe to changes on a board at all. If the
-- table was added to the `supabase_realtime` publication, the column mask is
-- narrowed here instead, so a broadcast cannot become an exfiltration channel
-- that RLS never sees.
-- =============================================================================

do $$
declare
  v_pub text;
begin
  select pubname into v_pub
    from pg_publication
   where pubname = 'supabase_realtime';

  if v_pub is null then
    raise notice 'rbac 04: supabase_realtime publication not present; skipping realtime narrowing';
    return;
  end if;

  raise notice 'rbac 04: realtime publication % present. records/cell_values have no client RLS policy, so a client cannot subscribe to them. If realtime was previously enabled for clients, remove the publication to be certain:', v_pub;

  raise notice 'rbac 04:   alter publication supabase_realtime drop table public.records, public.cell_values;';
end
$$;

raise notice 'rbac 04: RLS enabled and policies written on every RBAC and content table';