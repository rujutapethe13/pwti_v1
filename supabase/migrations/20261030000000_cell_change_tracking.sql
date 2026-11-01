-- Cell change tracking: history, audit, last edited metadata
-- Apply manually in Supabase SQL editor (no CLI linkage). Run as a single transaction.

-- 1) Add audit columns to cell_values (if missing)
ALTER TABLE public.cell_values
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 2) Add last edited to records
ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid;

-- 3) Create cell_changes history table
CREATE TABLE IF NOT EXISTS public.cell_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  column_id text NOT NULL REFERENCES public.columns(id) ON DELETE CASCADE,
  board_id text NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'user'
);

CREATE INDEX IF NOT EXISTS idx_cell_changes_item_col ON public.cell_changes(item_id, column_id);
CREATE INDEX IF NOT EXISTS idx_cell_changes_board_time ON public.cell_changes(board_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_last_edited_at ON public.records(last_edited_at);

-- 4) Trigger function
CREATE OR REPLACE FUNCTION public.track_cell_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_source text := COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'user');
BEGIN
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN others THEN
    v_actor := NULL;
  END;

  IF v_actor IS NULL AND v_source = 'user' THEN v_source := 'automation'; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := now();
    NEW.created_by := COALESCE(NEW.created_by, v_actor);
    NEW.updated_by := v_actor;

    INSERT INTO public.cell_changes(item_id, column_id, board_id, old_value, new_value, changed_by, changed_at, source)
    VALUES (NEW.record_id, NEW.column_id, NEW.board_id, NULL, to_jsonb(NEW.value), v_actor, now(), v_source);

    UPDATE public.records
    SET last_edited_at = now(),
        last_edited_by = v_actor
    WHERE id = NEW.record_id;

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      NEW.updated_at := now();
      NEW.updated_by := v_actor;

      INSERT INTO public.cell_changes(item_id, column_id, board_id, old_value, new_value, changed_by, changed_at, source)
      VALUES (NEW.record_id, NEW.column_id, NEW.board_id, to_jsonb(OLD.value), to_jsonb(NEW.value), v_actor, now(), v_source);

      UPDATE public.records
      SET last_edited_at = now(),
          last_edited_by = v_actor
    WHERE id = NEW.record_id;

      RETURN NEW;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_cell_changes ON public.cell_values;
CREATE TRIGGER trg_track_cell_changes
  BEFORE INSERT OR UPDATE ON public.cell_values
  FOR EACH ROW
  EXECUTE FUNCTION public.track_cell_changes();

-- 5) Backfill existing rows honestly, then apply insert/update defaults.
-- This backfill writes only audit metadata, never `value`, but the cell
-- write guard rejects any update to a column the caller cannot edit. Bypass
-- it for the migration's own backfill.
ALTER TABLE public.cell_values DISABLE TRIGGER guard_cell_values_update;
UPDATE public.cell_values cv
SET 
  created_at = COALESCE(cv.created_at, r.created_at),
  updated_at = COALESCE(cv.updated_at, r.updated_at, cv.created_at),
  created_by = cv.created_by,
  updated_by = cv.updated_by
FROM public.records r
WHERE cv.record_id = r.id
  AND (cv.created_at IS NULL OR cv.updated_at IS NULL);
ALTER TABLE public.cell_values ENABLE TRIGGER guard_cell_values_update;

ALTER TABLE public.cell_values
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- Bypass the record write guard for the migration's own audit backfill as well.
ALTER TABLE public.records DISABLE TRIGGER guard_records_update;
UPDATE public.records r
SET 
  last_edited_at = COALESCE(
  (SELECT MAX(cv.updated_at) FROM public.cell_values cv WHERE cv.record_id = r.id AND cv.updated_at IS NOT NULL),
    r.updated_at,
    r.created_at
  )
WHERE r.last_edited_at IS NULL;
ALTER TABLE public.records ENABLE TRIGGER guard_records_update;

-- 6) RLS
ALTER TABLE public.cell_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cell_changes_select ON public.cell_changes;
CREATE POLICY cell_changes_select ON public.cell_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = cell_changes.board_id
      AND (
        EXISTS (SELECT 1 FROM public.workspace_members wm JOIN public.workspaces w ON w.id = wm.workspace_id WHERE w.id = b.workspace_id AND wm.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = b.workspace_id AND w.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.boards b2 WHERE b2.id = b.id AND b2.created_by = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS cell_changes_insert ON public.cell_changes;
DROP POLICY IF EXISTS cell_changes_update ON public.cell_changes;
DROP POLICY IF EXISTS cell_changes_delete ON public.cell_changes;

DO $$ BEGIN RAISE NOTICE 'cell change tracking migration applied'; END $$;
