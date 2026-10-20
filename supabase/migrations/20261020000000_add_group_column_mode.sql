-- Phase 1: groups gain column_mode + composite unique; columns gain group_id
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS column_mode text NOT NULL DEFAULT 'shared'
    CHECK (column_mode IN ('shared','custom'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='groups_id_board_id_key') THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_id_board_id_key UNIQUE (id, board_id);
  END IF;
END $$;

ALTER TABLE public.columns
  ADD COLUMN IF NOT EXISTS group_id text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='columns_group_board_fk') THEN
    ALTER TABLE public.columns
      ADD CONSTRAINT columns_group_board_fk
      FOREIGN KEY (group_id, board_id) REFERENCES public.groups(id, board_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS columns_group_sort_idx ON public.columns (group_id, sort_order);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='records_group_board_fk') THEN
    ALTER TABLE public.records
      ADD CONSTRAINT records_group_board_fk
      FOREIGN KEY (group_id, board_id) REFERENCES public.groups(id, board_id);
  END IF;
END $$;

-- replace unique index on label_lower to allow same label across groups
DROP INDEX IF EXISTS columns_board_id_label_lower_key;
CREATE UNIQUE INDEX IF NOT EXISTS columns_shared_label_uq
  ON public.columns (board_id, label_lower)
  WHERE deleted_at IS NULL AND group_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS columns_custom_label_uq
  ON public.columns (board_id, group_id, label_lower)
  WHERE deleted_at IS NULL AND group_id IS NOT NULL;

-- replace unique (board_id, key) constraint similarly
ALTER TABLE public.columns DROP CONSTRAINT IF EXISTS columns_board_id_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS columns_shared_key_uq
  ON public.columns (board_id, key)
  WHERE deleted_at IS NULL AND group_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS columns_custom_key_uq
  ON public.columns (board_id, group_id, key)
  WHERE deleted_at IS NULL AND group_id IS NOT NULL;
