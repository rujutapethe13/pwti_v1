-- ════════════════════════════════════════════════════════════════════════════════
-- Powerweave Studio OS — Folders (board grouping)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- PRECEDENCE:
--   Apply AFTER migrations 001–008 (containment, roles, grants, visibility,
--   invitations, audit_log, RLS policies, dashboard_widgets).
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds `folder` to the `resource_type` enum so permission_grants can
--      scope grants to the 'folder' resource.
--   2. Creates `folders` table (single-level board grouping within a workspace).
--   3. Adds a nullable `folder_id` FK column to `boards` (on delete set null).
--   4. RLS policies on folders mirroring the existing boards pattern:
--        SELECT: is_workspace_member(workspace_id)
--        INSERT/UPDATE/DELETE: check_permission_manage(workspace_id, 'folder')
--
-- NOTE ON PK TYPE:
--   The rest of the metadata engine (organizations, workspaces, boards) uses
--   `text` primary keys. Folders follow that same convention for consistency.
--
-- ════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- 1. ADD 'folder' TO resource_type ENUM
-- ════════════════════════════════════════════════════════════

do $$ begin
  alter type public.resource_type add value if not exists 'folder';
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- ════════════════════════════════════════════════════════════
-- 0b. TEXT-BASED check_permission_manage OVERLOAD
-- ════════════════════════════════════════════════════════════
-- PostgreSQL forbids using a newly-added enum value in the SAME transaction
-- that added it (error 55P04). Because this migration both adds 'folder' to
-- resource_type AND creates policies that reference 'folder', the enum literal
-- in the policy expression cannot be resolved until the enum change is
-- committed. To break that dependency, we route the policy checks through a
-- text-based overload that casts the resource type to the enum INSIDE the
-- function body — resolution happens at call time, not at policy-creation time.
--
-- The existing `check_permission_manage(text, resource_type)` overload is
-- preserved for callers that already pass a typed enum literal.
-- ════════════════════════════════════════════════════════════

create or replace function public.check_permission_manage(
  p_workspace_id text,
  p_resource_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    inner join public.permission_grants pg
      on pg.workspace_id = wm.workspace_id
      and pg.role_id = wm.role_id
      and pg.resource_type = p_resource_type::public.resource_type
      and pg.action = 'manage'
      and pg.effect = 'allow'
    where wm.user_id = auth.uid()
      and wm.workspace_id = p_workspace_id
    union
    select 1
    from public.permission_grants pg
    where pg.workspace_id = p_workspace_id
      and pg.user_id = auth.uid()
      and pg.resource_type = p_resource_type::public.resource_type
      and pg.action = 'manage'
      and pg.effect = 'allow'
  );
$$;

-- ════════════════════════════════════════════════════════════
-- 2. FOLDERS TABLE
-- ════════════════════════════════════════════════════════════
-- Single-level only: a folder belongs to exactly one workspace and contains
-- boards. Nested folders are NOT supported in this pass.

drop table if exists public.folders cascade;
create table if not exists public.folders (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

drop index if exists folders_workspace_id_idx;
create index if not exists folders_workspace_id_idx on public.folders (workspace_id, position);

-- ── Updated_at trigger ─────────────────────────────────────

create or replace function public.update_folders_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_folders_updated_at on public.folders;
create trigger trg_folders_updated_at
  before update on public.folders
  for each row
  execute function public.update_folders_updated_at();

-- ════════════════════════════════════════════════════════════
-- 3. ADD folder_id TO BOARDS
-- ════════════════════════════════════════════════════════════

alter table public.boards
  add column if not exists folder_id text references public.folders(id) on delete set null;

drop index if exists boards_folder_id_idx;
create index if not exists boards_folder_id_idx on public.boards (folder_id);

-- ════════════════════════════════════════════════════════════
-- 4. ROW-LEVEL SECURITY (mirrors the boards pattern)
-- ════════════════════════════════════════════════════════════

alter table public.folders enable row level security;

-- SELECT: workspace members can view folders in their workspace
drop policy if exists "folders_select_workspace_member" on public.folders;
create policy "folders_select_workspace_member" on public.folders
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- INSERT: requires `manage` on `folder` resource_type
-- NOTE: `'folder'::text` explicitly routes to the TEXT overload of
-- check_permission_manage (resolved at policy-creation time). The enum cast
-- happens inside the function at query time — after the enum change above is
-- committed — avoiding the 55P04 "unsafe use of new enum value" error.
drop policy if exists "folders_insert_manage" on public.folders;
create policy "folders_insert_manage" on public.folders
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'folder'::text)
  );

-- UPDATE: requires `manage` on `folder` resource_type
drop policy if exists "folders_update_manage" on public.folders;
create policy "folders_update_manage" on public.folders
  for update
  using (
    public.check_permission_manage(workspace_id, 'folder'::text)
  );

-- DELETE: requires `manage` on `folder` resource_type
drop policy if exists "folders_delete_manage" on public.folders;
create policy "folders_delete_manage" on public.folders
  for delete
  using (
    public.check_permission_manage(workspace_id, 'folder'::text)
  );
