-- ────────────────────────────────────────────────────────────
-- Migration 007: Row-Level Security Policies
-- Part of the Powerweave Studio OS authorization & org model
--
-- Enables RLS on every new table and defines policies that
-- enforce workspace-scoped access.
-- ────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- HELPER FUNCTION: check_permission_manage
-- ════════════════════════════════════════════════════════════
--
-- Purpose: Avoids infinite recursion when permission_grants rows
-- need to be checked against permission_grants itself (for policies
-- that gate INSERT/UPDATE/DELETE on permission_grants).
--
-- How it works:
--   1. SECURITY DEFINER — runs as the owner (superuser/table owner),
--      bypassing the caller's RLS policies, so it can READ
--      permission_grants without triggering recursive policy evaluation.
--   2. It only READS, never writes, so there is no privilege escalation risk.
--   3. The function is scoped tightly: it returns a boolean based on
--      whether the calling user has a role in the workspace with a
--      `manage` action grant for the given resource_type.
--
-- Security rationale:
--   - SECURITY DEFINER is safe here because the function is read-only
--     (stable, no side effects).
--   - The function only checks grant existence; it cannot modify data.
--   - All input is parameterized (no SQL injection).
--   - The function name includes "manage" to signal its narrow purpose.
-- ════════════════════════════════════════════════════════════

create or replace function public.check_permission_manage(
  p_workspace_id text,
  p_resource_type public.resource_type
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
      and pg.resource_type = p_resource_type
      and pg.action = 'manage'
      and pg.effect = 'allow'
    where wm.user_id = auth.uid()
      and wm.workspace_id = p_workspace_id
    union
    select 1
    from public.permission_grants pg
    where pg.workspace_id = p_workspace_id
      and pg.user_id = auth.uid()
      and pg.resource_type = p_resource_type
      and pg.action = 'manage'
      and pg.effect = 'allow'
  );
$$;

-- ════════════════════════════════════════════════════════════
-- HELPER FUNCTION: is_workspace_member
-- ════════════════════════════════════════════════════════════
--
-- Simple check: is the current user a member of the given workspace?
-- This does NOT use SECURITY DEFINER because it queries workspace_members
-- whose RLS policy is straightforward (self-referential, but safe —
-- see the policy comment below).
-- ════════════════════════════════════════════════════════════

create or replace function public.is_workspace_member(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where user_id = auth.uid() and workspace_id = p_workspace_id
  );
$$;

-- ════════════════════════════════════════════════════════════
-- 1. TEAMS
-- ════════════════════════════════════════════════════════════

alter table public.teams enable row level security;

-- SELECT: user must be a member of the workspace this team belongs to
drop policy if exists "teams_select_workspace_member" on public.teams;
create policy "teams_select_workspace_member" on public.teams
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- INSERT/UPDATE/DELETE: user must have `manage` on `workspace` resource_type
drop policy if exists "teams_manage_permission" on public.teams;
create policy "teams_manage_permission" on public.teams
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "teams_manage_permission_update" on public.teams;
create policy "teams_manage_permission_update" on public.teams
  for update
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "teams_manage_permission_delete" on public.teams;
create policy "teams_manage_permission_delete" on public.teams
  for delete
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

-- ════════════════════════════════════════════════════════════
-- 2. DEPARTMENTS
-- ════════════════════════════════════════════════════════════

alter table public.departments enable row level security;

drop policy if exists "departments_select_workspace_member" on public.departments;
create policy "departments_select_workspace_member" on public.departments
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

drop policy if exists "departments_manage_permission_insert" on public.departments;
create policy "departments_manage_permission_insert" on public.departments
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "departments_manage_permission_update" on public.departments;
create policy "departments_manage_permission_update" on public.departments
  for update
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "departments_manage_permission_delete" on public.departments;
create policy "departments_manage_permission_delete" on public.departments
  for delete
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

-- ════════════════════════════════════════════════════════════
-- 3. ROLES
-- ════════════════════════════════════════════════════════════

alter table public.roles enable row level security;

-- Anyone authenticated can SELECT system roles and roles in their orgs
drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated" on public.roles
  for select
  using (
    is_system_role = true
    or organization_id in (
      select w.organization_id
      from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      where wm.user_id = auth.uid()
    )
  );

-- Only users with `manage` on `workspace` in the relevant org can manage custom roles
drop policy if exists "roles_insert_manage" on public.roles;
create policy "roles_insert_manage" on public.roles
  for insert
  with check (
    is_system_role = false
    and exists (
      select 1 from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.action = 'manage' and pg.effect = 'allow'
      where wm.user_id = auth.uid()
        and w.organization_id = roles.organization_id
    )
  );

drop policy if exists "roles_update_delete_manage" on public.roles;
create policy "roles_update_delete_manage" on public.roles
  for update
  using (
    is_system_role = false
    and exists (
      select 1 from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.action = 'manage' and pg.effect = 'allow'
      where wm.user_id = auth.uid()
        and w.organization_id = roles.organization_id
    )
  );

drop policy if exists "roles_update_delete_manage_delete" on public.roles;
create policy "roles_update_delete_manage_delete" on public.roles
  for delete
  using (
    is_system_role = false
    and exists (
      select 1 from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.action = 'manage' and pg.effect = 'allow'
      where wm.user_id = auth.uid()
        and w.organization_id = roles.organization_id
    )
  );

-- ════════════════════════════════════════════════════════════
-- 4. WORKSPACE MEMBERS
-- ════════════════════════════════════════════════════════════
--
-- NOTE: The SELECT policy below uses the SECURITY DEFINER is_workspace_member()
-- helper instead of a self-referential subquery to avoid infinite recursion.
-- A subquery like "SELECT ... FROM workspace_members WHERE ..." would re-enter
-- this table's SELECT policy, causing Postgres to abort with
-- "infinite recursion detected in policy for relation 'workspace_members'".
-- is_workspace_member() is SECURITY DEFINER (read-only), so its internal
-- query bypasses RLS safely.
-- ════════════════════════════════════════════════════════════

alter table public.workspace_members enable row level security;

-- SELECT: user can see their own memberships and memberships in workspaces they belong to
-- Uses the SECURITY DEFINER is_workspace_member() helper to avoid infinite recursion.
-- (The subquery approach would query workspace_members again, re-entering its own
-- SELECT policy and triggering infinite recursion.)
drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select" on public.workspace_members
  for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

-- INSERT/UPDATE/DELETE: user must have `manage` on `workspace`
drop policy if exists "workspace_members_insert_manage" on public.workspace_members;
create policy "workspace_members_insert_manage" on public.workspace_members
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "workspace_members_update_manage" on public.workspace_members;
create policy "workspace_members_update_manage" on public.workspace_members
  for update
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "workspace_members_delete_manage" on public.workspace_members;
create policy "workspace_members_delete_manage" on public.workspace_members
  for delete
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

-- ════════════════════════════════════════════════════════════
-- 5. TEAM MEMBERS
-- ════════════════════════════════════════════════════════════

alter table public.team_members enable row level security;

-- SELECT: user can see team members for teams in their workspaces
drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members
  for select
  using (
    team_id in (
      select t.id from public.teams t
      where public.is_workspace_member(t.workspace_id)
    )
  );

-- INSERT/UPDATE/DELETE: requires `manage` on `workspace` for the team's workspace
drop policy if exists "team_members_insert_manage" on public.team_members;
create policy "team_members_insert_manage" on public.team_members
  for insert
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.check_permission_manage(t.workspace_id, 'workspace')
    )
  );

drop policy if exists "team_members_update_manage" on public.team_members;
create policy "team_members_update_manage" on public.team_members
  for update
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.check_permission_manage(t.workspace_id, 'workspace')
    )
  );

drop policy if exists "team_members_delete_manage" on public.team_members;
create policy "team_members_delete_manage" on public.team_members
  for delete
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.check_permission_manage(t.workspace_id, 'workspace')
    )
  );

-- ════════════════════════════════════════════════════════════
-- 6. PERMISSION GRANTS
-- ════════════════════════════════════════════════════════════

alter table public.permission_grants enable row level security;

-- SELECT: user can see grants for workspaces they belong to
drop policy if exists "permission_grants_select" on public.permission_grants;
create policy "permission_grants_select" on public.permission_grants
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- INSERT/UPDATE/DELETE: requires `manage` on the same resource_type
-- being granted. Uses the SECURITY DEFINER helper to avoid recursion.
drop policy if exists "permission_grants_insert_manage" on public.permission_grants;
create policy "permission_grants_insert_manage" on public.permission_grants
  for insert
  with check (
    public.check_permission_manage(workspace_id, resource_type)
  );

drop policy if exists "permission_grants_update_manage" on public.permission_grants;
create policy "permission_grants_update_manage" on public.permission_grants
  for update
  using (
    public.check_permission_manage(workspace_id, resource_type)
  );

drop policy if exists "permission_grants_delete_manage" on public.permission_grants;
create policy "permission_grants_delete_manage" on public.permission_grants
  for delete
  using (
    public.check_permission_manage(workspace_id, resource_type)
  );

-- ════════════════════════════════════════════════════════════
-- 7. COLUMN VISIBILITY RULES
-- ════════════════════════════════════════════════════════════

alter table public.column_visibility_rules enable row level security;

-- SELECT: user can see rules for boards in their workspaces
drop policy if exists "column_visibility_rules_select" on public.column_visibility_rules;
create policy "column_visibility_rules_select" on public.column_visibility_rules
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- INSERT/UPDATE/DELETE: requires `manage` on `board` resource_type
drop policy if exists "column_visibility_rules_insert_manage" on public.column_visibility_rules;
create policy "column_visibility_rules_insert_manage" on public.column_visibility_rules
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'board')
  );

drop policy if exists "column_visibility_rules_update_manage" on public.column_visibility_rules;
create policy "column_visibility_rules_update_manage" on public.column_visibility_rules
  for update
  using (
    public.check_permission_manage(workspace_id, 'board')
  );

drop policy if exists "column_visibility_rules_delete_manage" on public.column_visibility_rules;
create policy "column_visibility_rules_delete_manage" on public.column_visibility_rules
  for delete
  using (
    public.check_permission_manage(workspace_id, 'board')
  );

-- ════════════════════════════════════════════════════════════
-- 8. INVITATIONS
-- ════════════════════════════════════════════════════════════

alter table public.invitations enable row level security;

-- SELECT:
--   - Workspace members with `manage` on `workspace` can see all invites for their workspace
--   - The invited email (case-insensitive) can see their own pending invites
drop policy if exists "invitations_select" on public.invitations;
create policy "invitations_select" on public.invitations
  for select
  using (
    (
      -- Workspace managers can see all invites
      public.is_workspace_member(workspace_id)
      and public.check_permission_manage(workspace_id, 'workspace')
    )
    or (
      -- The invited person can see their own pending invite
      lower(email) = lower(auth.email()::text)
      and status = 'pending'
    )
  );

-- INSERT: only workspace members with `manage` on `workspace`
drop policy if exists "invitations_insert_manage" on public.invitations;
create policy "invitations_insert_manage" on public.invitations
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.check_permission_manage(workspace_id, 'workspace')
  );

-- UPDATE:
--   - Managers can update any invite in their workspace
--   - The invited person can update their own pending invite (to accept/reject)
drop policy if exists "invitations_update" on public.invitations;
create policy "invitations_update" on public.invitations
  for update
  using (
    (
      public.is_workspace_member(workspace_id)
      and public.check_permission_manage(workspace_id, 'workspace')
    )
    or (
      lower(email) = lower(auth.email()::text)
      and status = 'pending'
    )
  );

-- DELETE: only workspace members with `manage` on `workspace`
drop policy if exists "invitations_delete_manage" on public.invitations;
create policy "invitations_delete_manage" on public.invitations
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.check_permission_manage(workspace_id, 'workspace')
  );

-- ════════════════════════════════════════════════════════════
-- 9. AUDIT LOG
-- ════════════════════════════════════════════════════════════

alter table public.audit_log enable row level security;

-- INSERT: unrestricted — the system (or any authenticated user) can write audit events.
-- This is intentional: even failed logins from unknown users should be logged.
drop policy if exists "audit_log_insert_all" on public.audit_log;
create policy "audit_log_insert_all" on public.audit_log
  for insert
  with check (true);

-- SELECT: restricted to workspace members with `view` or `manage` on `workspace`
-- for that workspace_id. For non-workspace-scoped events (workspace_id is null),
-- only users with at least one workspace membership can view them.
drop policy if exists "audit_log_select_workspace_scoped" on public.audit_log;
create policy "audit_log_select_workspace_scoped" on public.audit_log
  for select
  using (
    workspace_id is null
    and exists (
      select 1 from public.workspace_members where user_id = auth.uid()
    )
    or (
      workspace_id is not null
      and public.is_workspace_member(workspace_id)
      and exists (
        select 1 from public.workspace_members wm
        inner join public.permission_grants pg
          on pg.workspace_id = wm.workspace_id
          and pg.role_id = wm.role_id
          and pg.action in ('view', 'manage')
          and pg.resource_type = 'workspace'
          and pg.effect = 'allow'
        where wm.user_id = auth.uid()
          and wm.workspace_id = audit_log.workspace_id
      )
    )
  );

-- No UPDATE or DELETE policies — audit_log is append-only.
-- If rows need to be purged, use a separate maintenance function
-- that runs with elevated privileges.

-- ════════════════════════════════════════════════════════════
-- 10. CONNECTED-DATA TABLES (relationships / derived_values /
--     dependency_graph_edges)
-- ════════════════════════════════════════════════════════════
--
-- These tables are created in migration `..._connected_data_engine.sql`,
-- which only ENABLES RLS (it cannot define policies because the
-- `workspace_members` table and the `is_workspace_member` helper are not
-- created until later migrations). We define the workspace-scoped policies
-- here so they exist once the full auth model is in place.

-- SELECT: workspace members can read connected-data rows for their workspace
drop policy if exists "relationships_select_workspace_member" on public.relationships;
create policy "relationships_select_workspace_member" on public.relationships
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "derived_values_select_workspace_member" on public.derived_values;
create policy "derived_values_select_workspace_member" on public.derived_values
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "dependency_graph_select_workspace_member" on public.dependency_graph_edges;
create policy "dependency_graph_select_workspace_member" on public.dependency_graph_edges
  for select
  using (public.is_workspace_member(workspace_id));

-- INSERT/UPDATE/DELETE: require `manage` on `relationship` / `record` resource
drop policy if exists "relationships_insert_manage" on public.relationships;
create policy "relationships_insert_manage" on public.relationships
  for insert
  with check (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "relationships_update_manage" on public.relationships;
create policy "relationships_update_manage" on public.relationships
  for update
  using (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "relationships_delete_manage" on public.relationships;
create policy "relationships_delete_manage" on public.relationships
  for delete
  using (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "derived_values_insert_manage" on public.derived_values;
create policy "derived_values_insert_manage" on public.derived_values
  for insert
  with check (public.check_permission_manage(workspace_id, 'record'));

drop policy if exists "derived_values_update_manage" on public.derived_values;
create policy "derived_values_update_manage" on public.derived_values
  for update
  using (public.check_permission_manage(workspace_id, 'record'));

drop policy if exists "derived_values_delete_manage" on public.derived_values;
create policy "derived_values_delete_manage" on public.derived_values
  for delete
  using (public.check_permission_manage(workspace_id, 'record'));

drop policy if exists "dependency_graph_insert_manage" on public.dependency_graph_edges;
create policy "dependency_graph_insert_manage" on public.dependency_graph_edges
  for insert
  with check (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "dependency_graph_update_manage" on public.dependency_graph_edges;
create policy "dependency_graph_update_manage" on public.dependency_graph_edges
  for update
  using (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "dependency_graph_delete_manage" on public.dependency_graph_edges;
create policy "dependency_graph_delete_manage" on public.dependency_graph_edges
  for delete
  using (public.check_permission_manage(workspace_id, 'relationship'));

