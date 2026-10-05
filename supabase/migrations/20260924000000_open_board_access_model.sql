-- ════════════════════════════════════════════════════════════════════════════════
-- Open By Default, Restricted By Exception — Board Access Model v2
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Replaces the legacy "locked by default" model where every board required an
-- explicit board_access_overrides or board_access_roles row to be visible.
--
-- New model:
--   1. Every board is visible to all workspace members by default.
--   2. A board can be explicitly marked `is_restricted = true` by an owner/admin.
--   3. Only restricted boards show the lock icon + "Request access" flow.
--   4. The workspace owner (rujutapethe@gmail.com) always has full access everywhere.
--   5. Admin rights are configurable via the `board_admins` table — owners can
--      be transferred or additional admins added at any time without a code change.
--
-- ────────────────────────────────────────────────────────────────────────────────

-- ── 1. Add is_restricted column to boards ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'boards' AND column_name = 'is_restricted'
  ) THEN
    ALTER TABLE public.boards ADD COLUMN is_restricted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS boards_is_restricted_idx ON public.boards (is_restricted) WHERE is_restricted = true;

-- ── 2. Extend board_access_requests with requester info + response token ──────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'board_access_requests' AND column_name = 'requester_name'
  ) THEN
    ALTER TABLE public.board_access_requests ADD COLUMN requester_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'board_access_requests' AND column_name = 'requester_email'
  ) THEN
    ALTER TABLE public.board_access_requests ADD COLUMN requester_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'board_access_requests' AND column_name = 'responded_at'
  ) THEN
    ALTER TABLE public.board_access_requests ADD COLUMN responded_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'board_access_requests' AND column_name = 'response_token'
  ) THEN
    ALTER TABLE public.board_access_requests ADD COLUMN response_token uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS board_access_requests_board_status_idx ON public.board_access_requests (board_id, status);

-- ── 3. board_admins — configurable owner/admin roles per workspace ─────────────
--
-- This table makes admin rights configurable and transferable.
-- The workspace owner is seeded with role = 'owner'; additional admins
-- can be added with role = 'admin'. Both can manage board restrictions
-- and access requests.
--
-- To transfer ownership: change the role of the current owner to 'admin'
-- and insert the new user with role = 'owner'.
-- To add an admin: insert a new row with role = 'admin'.

CREATE TABLE IF NOT EXISTS public.board_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS board_admins_user_id_idx ON public.board_admins (user_id);
CREATE INDEX IF NOT EXISTS board_admins_workspace_role_idx ON public.board_admins (workspace_id, role);

-- ── 4. board_restrictions — audit trail of restriction changes ─────
-- (Supplementary to the is_restricted boolean on boards.)

CREATE TABLE IF NOT EXISTS public.board_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id text NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  is_restricted boolean NOT NULL DEFAULT true,
  restricted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_restrictions_board_id_idx ON public.board_restrictions (board_id);

-- ── 5. RLS: board_admins ─────────────────────────────────────────────────────────────────

ALTER TABLE public.board_admins ENABLE ROW LEVEL SECURITY;

-- Owners and admins can read all admin rows in their workspaces.
-- Regular users can read their own row (if they happen to be an admin).
DROP POLICY IF EXISTS "board_admins_select" ON public.board_admins;
CREATE POLICY "board_admins_select"
  ON public.board_admins FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Current user is an admin in this workspace (owner or admin role)
      EXISTS (
        SELECT 1 FROM public.board_admins ba2
        WHERE ba2.workspace_id = board_admins.workspace_id
          AND ba2.user_id = auth.uid()
          AND ba2.role IN ('owner', 'admin')
      )
    )
  );

-- Only existing owners/admins can insert new admin entries.
DROP POLICY IF EXISTS "board_admins_insert" ON public.board_admins;
CREATE POLICY "board_admins_insert"
  ON public.board_admins FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.board_admins ba
      WHERE ba.workspace_id = board_admins.workspace_id
        AND ba.user_id = auth.uid()
        AND ba.role IN ('owner', 'admin')
    )
  );

-- Only existing owners can update role (to prevent privilege escalation by non-owners).
DROP POLICY IF EXISTS "board_admins_update" ON public.board_admins;
CREATE POLICY "board_admins_update"
  ON public.board_admins FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.board_admins ba
      WHERE ba.workspace_id = board_admins.workspace_id
        AND ba.user_id = auth.uid()
        AND ba.role = 'owner'
    )
  );

-- Only existing owners can delete admin entries (transfer/remove).
DROP POLICY IF EXISTS "board_admins_delete" ON public.board_admins;
CREATE POLICY "board_admins_delete"
  ON public.board_admins FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.board_admins ba
      WHERE ba.workspace_id = board_admins.workspace_id
        AND ba.user_id = auth.uid()
        AND ba.role = 'owner'
    )
  );

-- ── 6. RLS: boards — owners/admins can update is_restricted ──────────────────────

DROP POLICY IF EXISTS "boards_update_restriction" ON public.boards;
CREATE POLICY "boards_update_restriction"
  ON public.boards FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.board_admins ba
      INNER JOIN public.workspaces w ON w.id = boards.workspace_id
      WHERE ba.workspace_id = boards.workspace_id
        AND ba.user_id = auth.uid()
        AND ba.role IN ('owner', 'admin')
    )
  );

-- ── 7. RLS: board_access_requests — requesters, approvers ────────────────────────

-- Users can read their own requests.
DROP POLICY IF EXISTS "board_access_requests_select_own" ON public.board_access_requests;
CREATE POLICY "board_access_requests_select_own"
  ON public.board_access_requests FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.board_admins ba
        INNER JOIN public.boards b ON b.id = board_access_requests.board_id
        WHERE ba.workspace_id = b.workspace_id
          AND ba.user_id = auth.uid()
          AND ba.role IN ('owner', 'admin')
      )
    )
  );

-- Users can insert their own requests (for any board — the API route enforces
-- that only restricted boards accept requests).
DROP POLICY IF EXISTS "board_access_requests_insert_own" ON public.board_access_requests;
CREATE POLICY "board_access_requests_insert_own"
  ON public.board_access_requests FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- Admins/owners can update requests (approve/deny).
DROP POLICY IF EXISTS "board_access_requests_update_admin" ON public.board_access_requests;
CREATE POLICY "board_access_requests_update_admin"
  ON public.board_access_requests FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- The user is an admin for the board's workspace
      EXISTS (
        SELECT 1 FROM public.board_admins ba
        INNER JOIN public.boards b ON b.id = board_access_requests.board_id
        WHERE ba.workspace_id = b.workspace_id
          AND ba.user_id = auth.uid()
          AND ba.role IN ('owner', 'admin')
      )
      -- Or the requester themselves (to withdraw/cancel)
      OR user_id = auth.uid()
    )
  );
