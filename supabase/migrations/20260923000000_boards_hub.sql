-- Add created_by to boards if not present (maps to users.id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'boards' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.boards ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS boards_created_by_idx ON public.boards (created_by);
  END IF;
END $$;

-- Board access roles: which workspace roles can access which board
CREATE TABLE IF NOT EXISTS public.board_access_roles (
  board_id text NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (board_id, role)
);

CREATE INDEX IF NOT EXISTS board_access_roles_board_id_idx ON public.board_access_roles (board_id);

-- Board access overrides: explicit per-user grant/revoke
CREATE TABLE IF NOT EXISTS public.board_access_overrides (
  board_id text NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access text NOT NULL CHECK (access IN ('granted', 'revoked')),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS board_access_overrides_user_id_idx ON public.board_access_overrides (user_id);

-- Board access requests: track pending/approved/denied requests
CREATE TABLE IF NOT EXISTS public.board_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id text NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS board_access_requests_user_id_idx ON public.board_access_requests (user_id);

-- RLS: board_access_roles (readable by any authenticated user)
ALTER TABLE public.board_access_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_access_roles_select_authenticated"
  ON public.board_access_roles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS: board_access_overrides (users can read their own; admins can manage)
ALTER TABLE public.board_access_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_access_overrides_select_own"
  ON public.board_access_overrides FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "board_access_overrides_upsert_own"
  ON public.board_access_overrides FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "board_access_overrides_update_own"
  ON public.board_access_overrides FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- RLS: board_access_requests (users can read their own, request access)
ALTER TABLE public.board_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_access_requests_select_own"
  ON public.board_access_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "board_access_requests_insert_own"
  ON public.board_access_requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "board_access_requests_update_own"
  ON public.board_access_requests FOR UPDATE
  USING (auth.uid() IS NOT NULL);
