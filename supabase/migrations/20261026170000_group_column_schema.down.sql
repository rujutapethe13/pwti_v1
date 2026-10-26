ALTER TABLE public.columns DROP CONSTRAINT IF EXISTS columns_source_column_fk;
DROP INDEX IF EXISTS columns_scope_board_group_idx;
ALTER TABLE public.columns
  DROP COLUMN IF EXISTS source_column_id,
  DROP COLUMN IF EXISTS scope;
