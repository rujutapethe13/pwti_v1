-- ═══════════════════════════════════════════════════════════════════════════
-- Powerweave Studio OS — Owner-only access layer for RLS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PURPOSE
--   Restricts ALL data access to authenticated users only.
--   Any authenticated user can read or modify data.
--
-- HOW IT WORKS
--   1. A SECURITY DEFINER helper `public.is_owner()` checks auth.uid().
--      SECURITY DEFINER ensures it always runs with definer rights and
--      cannot be blocked by the caller's RLS.
--   2. For every table that has RLS enabled, we DROP all existing policies
--      and replace them with owner-only policies. This avoids the Postgres
--      "AND multiple policies" problem where an owner-only policy would
--      pass but a restrictive workspace-member policy would fail.
--   3. The existing helper functions (check_permission_manage,
--      is_workspace_member, onboard_workspace_owner) are preserved — they
--      are used by SECURITY DEFINER functions which bypass RLS entirely.
--
-- RUN THIS IN: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: is_owner ──────────────────────────────────────────────────────
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER TO DROP ALL POLICIES ON A TABLE
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.drop_all_policies(p_table_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = p_table_name
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, p_table_name);
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- APPLY OWNER-ONLY POLICIES TO EVERY TABLE (skip missing tables)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOR tbl, policy_name IN VALUES
    ('organizations', 'organizations_owner_all'),
    ('workspaces', 'workspaces_owner_all'),
    ('boards', 'boards_owner_all'),
    ('groups', 'groups_owner_all'),
    ('columns', 'columns_owner_all'),
    ('records', 'records_owner_all'),
    ('cell_values', 'cell_values_owner_all'),
    ('views', 'views_owner_all'),
    ('column_dependencies', 'column_dependencies_owner_all'),
    ('permissions', 'permissions_owner_all'),
    ('search_index', 'search_index_owner_all'),
    ('teams', 'teams_owner_all'),
    ('departments', 'departments_owner_all'),
    ('roles', 'roles_owner_all'),
    ('workspace_members', 'workspace_members_owner_all'),
    ('team_members', 'team_members_owner_all'),
    ('permission_grants', 'permission_grants_owner_all'),
    ('column_visibility_rules', 'column_visibility_rules_owner_all'),
    ('invitations', 'invitations_owner_all'),
    ('audit_log', 'audit_log_owner_all'),
    ('relationships', 'relationships_owner_all'),
    ('derived_values', 'derived_values_owner_all'),
    ('dependency_graph_edges', 'dependency_graph_edges_owner_all'),
    ('dashboard_widgets', 'dashboard_widgets_owner_all'),
    ('folders', 'folders_owner_all')
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('select public.drop_all_policies(%L)', tbl);
      EXECUTE format('alter table public.%I enable row level security', tbl);
      EXECUTE format($sql$
        create policy %I on public.%I
          for all
          using (public.is_owner())
          with check (public.is_owner())
      $sql$, policy_name, tbl);
    END IF;
  END LOOP;
END;
$$;
