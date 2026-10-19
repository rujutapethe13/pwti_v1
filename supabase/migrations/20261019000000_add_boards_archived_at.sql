-- ── add boards.archived_at (soft-delete) ──────────────────────────────────────
-- delete_board() (migration 20261008000000_delete_persistence_fix.sql) soft-deletes
-- a board by setting status = 'archived' AND archived_at = now(). That column was
-- never added to the boards table, so every soft-delete failed with
--   column "archived_at" of relation "boards" does not exist
-- This migration adds the column (nullable, no default — consistent with
-- records.archived_at and workspaces.deleted_at) and an index so list queries
-- that filter on it stay cheap.
--
-- The column is nullable rather than NOT NULL DEFAULT now() because existing
-- rows must keep their current state (NULL = never archived) without a table
-- rewrite, and because the soft-delete UPDATE explicitly sets the value.

alter table public.boards
  add column if not exists archived_at timestamptz;

create index if not exists boards_archived_at_idx
  on public.boards (archived_at);

-- Composite index for the common "active boards in a workspace" filter used by
-- the Boards hub, my-work and get_my_boards.
create index if not exists boards_workspace_archived_idx
  on public.boards (workspace_id, archived_at)
  where archived_at is null;

-- ── purge_deleted_boards ─────────────────────────────────────────────────────
-- Background cleanup for soft-deleted boards. Mirrors purge_deleted_workspaces().
-- Called by a periodic job (pg_cron or a server-side scheduler) running as
-- service_role. It hard-deletes the board row and every child row (columns,
-- records, cell_values, groups, views, column_dependencies, permissions,
-- search_index, board_access_roles, board_access_overrides, board_access_requests,
-- board_member_overrides, client_board_access, client_column_permissions,
-- activity_logs (SET NULL), client_360_*) via ON DELETE CASCADE.
--
-- Runs with session_replication_role = 'replica' so the per-row write-guard
-- triggers (guard_board_write, guard_record_delete, guard_cell_value_write,
-- guard_group_write) are NOT fired — those call auth.uid() and run SELECT
-- queries per row, which is the bottleneck that made the old hard-delete path
-- exceed the client's 5 s timeout. Authorization was already checked at
-- soft-delete time; this function is gated to service_role or the super admin
-- so a caller cannot bypass the delete_board() permission check and purge a
-- board they could not have soft-deleted.
--
-- Processes at most p_batch_size boards per call so a very large batch stays
-- within a single transaction and a background worker can call it repeatedly.

create or replace function public.purge_deleted_boards(p_batch_size integer default 100)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_purged    bigint;
  v_batch     text[];
begin
  if not (public.is_service_role() or public.is_super_admin()) then
    raise exception 'rbac: purge_deleted_boards requires service_role or super admin'
      using errcode = '42501';
  end if;

  select array_agg(b.id order by b.archived_at asc)
    into v_batch
    from public.boards b
   where b.archived_at is not null
   limit p_batch_size;

  if v_batch is null or coalesce(array_length(v_batch, 1), 0) = 0 then
    return 0;
  end if;

  set local session_replication_role = 'replica';

  -- Hard-delete the soft-deleted boards. All ON DELETE CASCADE FKs
  -- (columns, groups, records, cell_values, views, column_dependencies,
  --  permissions, search_index, board_access_roles, board_access_overrides,
  --  board_access_requests, board_member_overrides, client_board_access,
  --  client_column_permissions, activity_logs (SET NULL), client_360_*) will
  --  cascade in the same statement.
  delete from public.boards
   where id = any(v_batch);

  get diagnostics v_purged = row_count;

  set local session_replication_role = 'DEFAULT';

  raise notice 'rbac 07c: purged % soft-deleted board(s) — %', v_purged, v_batch;

  return v_purged;
end
$$;

revoke all on function public.purge_deleted_boards(integer) from public;
grant execute on function public.purge_deleted_boards(integer) to service_role;