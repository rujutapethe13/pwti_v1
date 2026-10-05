-- ────────────────────────────────────────────────────────────
-- Migration 20260911000003: Fix workspace_members recursion + add created_by
-- ────────────────────────────────────────────────────────────
--
-- ROOT CAUSE
--   The workspace_members SELECT policy has a self-referential subquery:
--     workspace_id IN (SELECT workspace_id FROM public.workspace_members ...)
--   When Postgres evaluates this policy, the subquery re-enters RLS on the
--   same table, triggering the policy again → infinite recursion.
--
--   Additionally, the workspaces.created_by column was never added to the
--   table (only defined in the non-migration file RLS for core
--   metadata tables.sql), so the backfill migration fails silently.
--
-- FIX
--   1. Add workspaces.created_by column (idempotent).
--   2. Backfill created_by from the first Owner member.
--   3. Replace the self-referential SELECT policy with one that calls
--      the SECURITY DEFINER is_workspace_member() helper.
--   4. Ensure is_workspace_member() and check_permission_manage() are
--      SECURITY DEFINER (read-only helpers that bypass RLS safely).

-- ── 1. Add created_by column to workspaces ─────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS workspaces_created_by_idx;
CREATE INDEX IF NOT EXISTS workspaces_created_by_idx ON public.workspaces (created_by);

-- ── 2. Backfill created_by from first Owner ────────────────────
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

-- ── 3. Fix workspace_members SELECT policy ─────────────────────
-- Drop the old self-referential policy and replace with a non-recursive one
DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;

CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_workspace_member(workspace_id)
  );

-- ── 4. Ensure helper functions are SECURITY DEFINER ────────────
-- is_workspace_member: read-only check, bypasses RLS on workspace_members
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

-- check_permission_manage: read-only check, bypasses RLS via SECURITY DEFINER
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
