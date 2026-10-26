-- Decouple item identity from display position.
ALTER TABLE public.columns
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- Preserve the existing first-column appearance while making identity explicit.
WITH ranked AS (
  SELECT id, board_id, group_id,
         row_number() OVER (
           PARTITION BY board_id, group_id
           ORDER BY sort_order, created_at, id
         ) AS position
  FROM public.columns
  WHERE deleted_at IS NULL
)
UPDATE public.columns c
SET is_primary = true,
    pinned = true
FROM ranked r
WHERE c.id = r.id AND r.position = 1;

CREATE UNIQUE INDEX IF NOT EXISTS columns_one_primary_per_scope_idx
  ON public.columns (board_id, COALESCE(group_id, ''), is_primary)
  WHERE is_primary;

DO $$ BEGIN
  RAISE NOTICE 'primary columns migrated: %',
    (SELECT count(*) FROM public.columns WHERE is_primary);
END $$;
