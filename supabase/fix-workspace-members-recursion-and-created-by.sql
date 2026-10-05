-- ────────────────────────────────────────────────────────────
-- Fix: workspace_members recursion + workspaces.created_by
-- Run this in your Supabase SQL Editor
-- ────────────────────────────────────────────────────────────

-- 1. Add the missing created_by column to workspaces (idempotent)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS workspaces_created_by_idx;
CREATE INDEX IF NOT EXISTS workspaces_created_by_idx ON public.workspaces (created_by);

-- 2. Backfill created_by from the first Owner member of each workspace
-- ─────────────────────────────────────────────────────────────
UPDATE public.workspaces w
SET created_by = (
  SELECT wm.user_id
  FROM public.workspace_members wm
  INNER JOIN public.roles r ON r.id = wm.role_id
  WHERE wm.workspace_id = w.id
    AND r.name = 'Owner'
  ORDER BY wm.created_at ASC
  LIMIT 1
)
WHERE w.created_by IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    INNER JOIN public.roles r ON r.id = wm.role_id
    WHERE wm.workspace_id = w.id
      AND r.name = 'Owner'
  );

-- 3. Fix the self-referential workspace_members SELECT policy (the root cause of recursion)
-- ─────────────────────────────────────────────────────────────
-- The old policy had a subquery that queried workspace_members again, triggering
-- RLS recursively. We replace it with a call to the SECURITY DEFINER
-- is_workspace_member() helper, which bypasses RLS on workspace_members.

DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;

CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_workspace_member(workspace_id)
  );

-- 4. Ensure is_workspace_member is SECURITY DEFINER (bypasses RLS on workspace_members)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid() AND workspace_id = p_workspace_id
  );
$$;

-- 5. Ensure check_permission_manage is also SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_permission_manage(
  p_workspace_id text,
  p_resource_type public.resource_type
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    INNER JOIN public.permission_grants pg
      ON pg.workspace_id = wm.workspace_id
      AND pg.role_id = wm.role_id
      AND pg.resource_type = p_resource_type
      AND pg.action = 'manage'
      AND pg.effect = 'allow'
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id = p_workspace_id
    UNION
    SELECT 1
    FROM public.permission_grants pg
    WHERE pg.workspace_id = p_workspace_id
      AND pg.user_id = auth.uid()
      AND pg.resource_type = p_resource_type
      AND pg.action = 'manage'
      AND pg.effect = 'allow'
  );
$$;

-- 6. Verify the fixes
-- ─────────────────────────────────────────────────────────────
-- After running this script, verify in a new SQL query:
--
--   SELECT id, name, created_by FROM public.workspaces;
--   SELECT * FROM public.workspace_members;
--   SELECT public.is_workspace_member('ws-main');  -- as your user via anon key
--
-- Expected results:
--   - workspaces.created_by should be populated (not null) for all 3 workspaces
--   - workspace_members queries should work without recursion errors
--   - is_workspace_member('ws-main') should return true for workspace members

-- 7. Refresh PostgREST schema cache
-- ─────────────────────────────────────────────────────────────
-- The schema cache is auto-refreshed when functions/policies change,
-- but you can force a refresh via the Supabase Dashboard → Settings →
-- Database → "Reload schema cache" if needed.
