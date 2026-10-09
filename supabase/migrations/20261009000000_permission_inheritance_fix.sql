-- =============================================================================
-- Permission inheritance fix
--
-- Symptom: the workspace owner / creator and organization admins were shown as
-- "View — Inherited from workspace" on every board (including freshly created
-- ones), so the Members dialog was read-only and the toolbar reported
-- "View only". Three independent causes:
--
--   1. onboard_workspace_owner() only wrote the legacy `workspace_members.role_id`
--      and `permission_grants`, and never set `workspaces.owner_id`, so a newly
--      created workspace had no owner recorded and the creator fell through to the
--      workspace_members default role (viewer) on every board.
--   2. resolve_workspace_access() did not lift an organization admin above a
--      workspace-scoped viewer row, so an Admin whose membership had been written
--      as viewer was downgraded to 'view' here while can_edit_workspace() still
--      let them edit — a split-brain the Members dialog surfaced as "View only".
--   3. can_manage_members() only looked at the caller's board/workspace access,
--      so an admin whose own board-level grant was 'view' could not open the
--      Members dialog at all, even though they should always manage members.
--
-- Fix:
--   1. onboard_workspace_owner() records the owner on `workspaces`, writes a real
--      RBAC membership row (role='admin', can_edit=true) and a board_admins row,
--      so the owner is recognised as owner/admin by every layer at once.
--   2. resolve_workspace_access() returns 'edit' for an org admin in the
--      workspace's organization, matching can_edit_workspace().
--   3. can_manage_members() returns true for any workspace admin, so admins can
--      manage members even when their own board-level grant is 'view'.
--   4. A one-time backfill repairs existing workspaces/boards so creators and
--      admins stop inheriting a downgraded role.
--
-- Idempotent: safe to re-run whole. Must be applied AFTER
-- 20261005120000_members_and_access_management.sql.
-- =============================================================================

-- ── 1. onboarding: record the owner everywhere at once ─────────────────────────
-- Kept as `security definer` + `set search_path = public` to match the existing
-- definition's invoker rights and so it stays callable by the anon role.

create or replace function public.onboard_workspace_owner(p_workspace_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_role_id uuid;
  v_user_id       uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Only the creator may be onboarded as owner.
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and created_by = v_user_id
  ) then
    raise exception 'not the workspace creator';
  end if;

  -- Record the owner on the workspace itself. Every access layer keys off this,
  -- so it must be set unconditionally here — not just backfilled later.
  update public.workspaces
     set owner_id = v_user_id
   where id = p_workspace_id
     and owner_id is distinct from v_user_id;

  -- ── RBAC membership: the owner is an administrator (edit) on the workspace. ──
  -- resolve_workspace_access() returns 'owner' via the owner_id check above, so
  -- this role keeps the two layers in agreement instead of one downgrading the
  -- other. Written as an upsert so re-onboarding never clobbers a later demotion
  -- of a non-owner membership.
  insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit)
  values (v_user_id, p_workspace_id, 'admin'::public.app_role, true, true)
  on conflict (user_id, workspace_id) do update
   set role = excluded.role,
       can_view = true,
       can_edit = true;

  -- ── Configurable board-admin model: the owner is an owner admin. ─────────
  insert into public.board_admins (workspace_id, user_id, role, created_by)
  values (p_workspace_id, v_user_id, 'owner', v_user_id)
  on conflict (workspace_id, user_id) do nothing;

  -- ── Legacy permission model (check_permission_manage / permission_grants). ──
  -- Kept only so the older endpoints that still read those tables continue to
  -- recognize the owner. Tolerate the legacy tables being absent.
  select id into v_owner_role_id
    from public.roles
   where name = 'Owner' and is_system_role
   limit 1;

  if v_owner_role_id is not null then
    insert into public.workspace_members (user_id, workspace_id, role_id)
    values (v_user_id, p_workspace_id, v_owner_role_id)
    on conflict (user_id, workspace_id) do nothing;

    if exists (
      select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'permission_grants'
         and c.relkind = 'r'
    ) then
      insert into public.permission_grants (workspace_id, role_id, resource_type, resource_id, action, effect)
      select p_workspace_id, v_owner_role_id, rt, null, 'manage', 'allow'
        from unnest(
          array['workspace','board','group','column','record','view','dashboard',
                'widget','relationship','formula','automation','ai']::public.resource_type[]
        ) as rt
      on conflict do nothing;
    end if;
  end if;
end
$$;

-- ── 2. resolve_workspace_access: never downgrade an admin ─────────────────────

create or replace function public.resolve_workspace_access(p_workspace_id text, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner    uuid;
  v_org      text;
  v_role     text;
  v_can_edit boolean;
begin
  if p_workspace_id is null or p_user_id is null then
    return null;
  end if;

  select w.owner_id, w.organization_id into v_owner, v_org
    from public.workspaces w
   where w.id = p_workspace_id;

  if not found then
    return null;
  end if;

  -- Super admin always has owner access everywhere
  if public.is_super_admin_user(p_user_id) then
    return 'owner';
  end if;

  -- The owner. app_role = 'admin' is a workspace administrator, not the owner:
  -- conflating the two would make every admin undeletable in the Members dialog.
  if v_owner = p_user_id then
    return 'owner';
  end if;

  -- An organization admin is never downgraded to a workspace-scoped viewer by an
  -- inherited default. can_edit_workspace() already grants org admins edit access
  -- on every workspace in their organization; this keeps the resolver consistent
  -- with that data-layer gate so the Members dialog and the toolbar agree with
  -- what the database actually allows.
  if p_user_id = auth.uid() and public.current_role() = 'admin' then
    return 'edit';
  end if;

  if exists (
    select 1
      from public.organization_members om
     where om.user_id = p_user_id
       and om.organization_id = v_org
       and lower(om.role) = 'admin'
  ) then
    return 'edit';
  end if;

  select wm.role::text, wm.can_edit
    into v_role, v_can_edit
    from public.workspace_members wm
   where wm.workspace_id = p_workspace_id
     and wm.user_id = p_user_id;

  if not found then
    return null;
  end if;

  if v_role = 'admin' or v_role = 'staff' or v_can_edit then
    return 'edit';
  end if;

  return 'view';
end
$$;

-- ── 3. can_manage_members: workspace admins manage members anywhere ───────────

create or replace function public.can_manage_members(p_workspace_id text, p_board_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_access text;
begin
  if v_uid is null or p_workspace_id is null then
    return false;
  end if;

  select w.owner_id into v_owner
    from public.workspaces w
   where w.id = p_workspace_id;

  -- The workspace owner always manages members on every board in the workspace.
  if v_owner = v_uid then
    return true;
  end if;

  -- Super admin, and any organization / workspace administrator, may manage
  -- members even on a board whose board-level grant is 'view'. The role itself is
  -- still reported as 'view' to them by resolve_board_access; only the ability to
  -- change members is elevated, so an admin is never locked out of the Members
  -- dialog by an inherited default.
  if public.can_manage_workspace_members(p_workspace_id) then
    return true;
  end if;

  if p_board_id is null then
    v_access := public.resolve_workspace_access(p_workspace_id, v_uid);
  else
    v_access := public.resolve_board_access(p_board_id, v_uid);
  end if;

  return v_access = 'owner' or v_access = 'edit';
end
$$;

grant execute on function public.resolve_workspace_access(text, uuid) to authenticated, service_role;
grant execute on function public.can_manage_members(text, text) to authenticated, service_role;

-- ── 4. One-time backfill of existing data ────────────────────────────────────
-- Repairs workspaces/boards created before this fix so creators and admins stop
-- inheriting a downgraded role. Every statement is idempotent.
do $$
declare
  v_owner_count int;
  v_admin_count  int;
  v_board_admin  int;
begin
  -- 4a. Every workspace must have an owner_id, falling back to created_by.
  update public.workspaces
     set owner_id = created_by
   where owner_id is null
     and created_by is not null;

  -- 4b. The workspace creator must be an admin (edit) on the workspace, even if
  -- their row was written by the old onboarding as a viewer.
  insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit)
  select w.owner_id, w.id, 'admin'::public.app_role, true, true
    from public.workspaces w
   where w.owner_id is not null
     and not exists (
       select 1 from public.workspace_members wm
        where wm.workspace_id = w.id
          and wm.user_id = w.owner_id
          and wm.role = 'admin'::public.app_role
          and wm.can_edit
     )
  on conflict (user_id, workspace_id) do update
   set role = excluded.role,
       can_view = true,
       can_edit = true;

  -- 4c. Existing admins (organization admins and legacy board_admins) must be
  -- admins (edit) on the workspace, never viewers, so the inheritance fix above is
  -- not undercut by a stale viewer row.
  insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit)
  select distinct om.user_id, w.id, 'admin'::public.app_role, true, true
    from public.organization_members om
    join public.workspaces w on w.organization_id = om.organization_id
   where lower(om.role) = 'admin'
     and not exists (
       select 1 from public.workspace_members wm
        where wm.workspace_id = w.id
          and wm.user_id = om.user_id
          and wm.role = 'admin'::public.app_role
          and wm.can_edit
     )
  on conflict (user_id, workspace_id) do update
   set role = excluded.role,
       can_view = true,
       can_edit = true;

  insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit)
  select ba.user_id, ba.workspace_id, 'admin'::public.app_role, true, true
    from public.board_admins ba
   where lower(ba.role) = 'admin'
     and not exists (
       select 1 from public.workspace_members wm
        where wm.workspace_id = ba.workspace_id
          and wm.user_id = ba.user_id
     )
  on conflict (user_id, workspace_id) do update
   set role = 'admin'::public.app_role,
       can_view = true,
       can_edit = true
   where workspace_members.role is distinct from 'admin'::public.app_role;

  -- 4d. The workspace owner must be an owner admin in the configurable
  -- board_admins model too, so the legacy canManageWorkspace lookup recognizes the
  -- owner even when they are not the hardcoded OWNER_EMAIL.
  insert into public.board_admins (workspace_id, user_id, role, created_by)
  select w.id, w.owner_id, 'owner', w.owner_id
    from public.workspaces w
   where w.owner_id is not null
     and not exists (
       select 1 from public.board_admins ba
        where ba.workspace_id = w.id and ba.user_id = w.owner_id
     )
  on conflict (workspace_id, user_id) do update
   set role = 'owner'
   where board_admins.role is distinct from 'owner';

  select count(*) into v_owner_count from public.workspaces where owner_id is not null;
  select count(*) into v_admin_count from public.workspace_members where role = 'admin'::public.app_role;
  select count(*) into v_board_admin from public.board_admins where role = 'owner';

  raise notice 'inheritance fix: % workspaces have an owner, % workspace_members admin rows, % board_admins owner rows',
    v_owner_count, v_admin_count, v_board_admin;
  raise notice 'inheritance fix: resolve_workspace_access lifts org admins to edit; can_manage_members elevates workspace admins; onboarding writes owner_id + admin role';
end
$$;
