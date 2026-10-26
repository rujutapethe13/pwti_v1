DROP INDEX IF EXISTS public.columns_one_primary_per_scope_idx;
ALTER TABLE public.columns
  DROP COLUMN IF EXISTS is_primary,
  DROP COLUMN IF EXISTS pinned;
