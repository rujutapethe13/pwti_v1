-- Rollback for 20261020000000_add_group_column_mode.sql
ALTER TABLE public.records DROP CONSTRAINT IF EXISTS records_group_board_fk;
ALTER TABLE public.columns DROP CONSTRAINT IF EXISTS columns_group_board_fk;
DROP INDEX IF EXISTS columns_group_sort_idx;
ALTER TABLE public.columns DROP COLUMN IF EXISTS group_id;
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_id_board_id_key;
ALTER TABLE public.groups DROP COLUMN IF EXISTS column_mode;
-- restore unique indexes/constraints as needed (manual)
