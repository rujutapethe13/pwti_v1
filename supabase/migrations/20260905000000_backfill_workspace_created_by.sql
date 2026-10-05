-- ────────────────────────────────────────────────────────────
-- Migration 20260905000000: Backfill created_by on workspaces
--
-- Workspaces created before the onboarding fix did not have
-- `created_by` set. This backfill populates `created_by` from the
-- first Owner member of each workspace (if one exists), so that
-- `is_workspace_member` RLS checks and `onboard_workspace_owner`
-- work correctly for previously-created workspaces.
-- ────────────────────────────────────────────────────────────

-- Set created_by to the first Owner's user_id for workspaces
-- where it is currently NULL and an Owner member exists.
UPDATE public.workspaces w
SET created_by = COALESCE(w.created_by, (
  SELECT wm.user_id
  FROM public.workspace_members wm
  INNER JOIN public.roles r ON r.id = wm.role_id
  WHERE wm.workspace_id = w.id
    AND r.name = 'Owner'
  ORDER BY wm.created_at ASC
  LIMIT 1
))
WHERE w.created_by IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    INNER JOIN public.roles r ON r.id = wm.role_id
    WHERE wm.workspace_id = w.id
      AND r.name = 'Owner'
  );

-- Log how many workspaces were updated for debugging.
DO $$
DECLARE
  v_count int := (SELECT count(*) FROM public.workspaces WHERE created_by IS NOT NULL);
BEGIN
  RAISE NOTICE '[Backfill] Workspaces with created_by set: %', v_count;
END $$;
