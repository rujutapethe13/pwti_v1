-- Per-group column schema compatibility layer.
-- Existing rows remain board-scoped and existing groups remain shared.

ALTER TABLE public.columns
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'board'
    CHECK (scope IN ('board', 'group')),
  ADD COLUMN IF NOT EXISTS source_column_id text;

UPDATE public.columns
SET scope = CASE WHEN group_id IS NULL THEN 'board' ELSE 'group' END
WHERE scope IS NULL OR (scope = 'board' AND group_id IS NOT NULL);

UPDATE public.columns
SET scope = 'board'
WHERE group_id IS NULL;

CREATE INDEX IF NOT EXISTS columns_scope_board_group_idx
  ON public.columns (board_id, scope, group_id, sort_order);

UPDATE public.columns
SET source_column_id = NULL
WHERE source_column_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.columns source WHERE source.id = columns.source_column_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'columns_source_column_fk'
  ) THEN
    ALTER TABLE public.columns
      ADD CONSTRAINT columns_source_column_fk
      FOREIGN KEY (source_column_id) REFERENCES public.columns(id) ON DELETE SET NULL;
  END IF;
END $$;
