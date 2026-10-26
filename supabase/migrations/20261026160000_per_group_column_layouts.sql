-- Per-group column layouts
--
-- Columns remain board metadata. A layout only references column ids, so
-- hiding/removing a column from a group never removes its cell_values.

CREATE TABLE IF NOT EXISTS public.board_column_layouts (
  board_id text PRIMARY KEY REFERENCES public.boards(id) ON DELETE CASCADE,
  column_ids text[] NOT NULL DEFAULT '{}'::text[],
  column_widths jsonb NOT NULL DEFAULT '{}'::jsonb,
  hidden_column_ids text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_column_layouts (
  group_id text PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  board_id text NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'inherit'
    CHECK (mode IN ('inherit', 'custom')),
  column_ids text[] NOT NULL DEFAULT '{}'::text[],
  column_widths jsonb NOT NULL DEFAULT '{}'::jsonb,
  hidden_column_ids text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_column_layouts_board_idx
  ON public.group_column_layouts (board_id);

-- Populate the board default from the existing board-level column library.
INSERT INTO public.board_column_layouts (board_id, column_ids, column_widths, hidden_column_ids)
SELECT
  b.id,
  COALESCE(
    ARRAY(
      SELECT c.id
      FROM public.columns c
      WHERE c.board_id = b.id
        AND c.group_id IS NULL
        AND c.deleted_at IS NULL
      ORDER BY c.sort_order, c.created_at, c.id
    ),
    '{}'::text[]
  ),
  '{}'::jsonb,
  COALESCE(
    ARRAY(
      SELECT c.id
      FROM public.columns c
      WHERE c.board_id = b.id
        AND c.group_id IS NULL
        AND c.deleted_at IS NULL
        AND c.hidden
      ORDER BY c.sort_order, c.created_at, c.id
    ),
    '{}'::text[]
  )
FROM public.boards b
ON CONFLICT (board_id) DO NOTHING;

-- Existing groups retain the current shared-column rendering. The legacy
-- column_mode column is left in place for compatibility with older clients;
-- the new layout table is authoritative for the per-group model.
INSERT INTO public.group_column_layouts (group_id, board_id, mode)
SELECT g.id, g.board_id, 'inherit'
FROM public.groups g
JOIN public.boards b ON b.id = g.board_id
ON CONFLICT (group_id) DO NOTHING;

UPDATE public.groups
SET column_mode = 'shared'
WHERE column_mode IS NULL OR column_mode NOT IN ('shared', 'custom');
