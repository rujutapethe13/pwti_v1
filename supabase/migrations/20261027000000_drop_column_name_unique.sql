-- Drop the (board_id, name) unique index on columns, if it exists.
-- Column identity is the id, never the name; duplicate names are allowed.

-- up
DO $$
BEGIN
  -- Try the most common index names
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'columns_board_id_name_key') THEN
    EXECUTE 'DROP INDEX IF EXISTS columns_board_id_name_key';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'columns_board_name_unique') THEN
    EXECUTE 'DROP INDEX IF EXISTS columns_board_name_unique';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_columns_board_name') THEN
    EXECUTE 'DROP INDEX IF EXISTS uq_columns_board_name';
  END IF;
  -- Fallback: drop any unique index on columns(board_id, name)
  DECLARE r record;
  BEGIN
    FOR r IN
      SELECT i.indexname
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.tablename
      WHERE i.tablename = 'columns'
        AND i.indexdef ILIKE '%UNIQUE%'
        AND i.indexdef ILIKE '%(board_id, label)%'
    LOOP
      EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.indexname);
    END LOOP;
  END;
END $$;

-- down (guarded no-op): recreating the unique index would fail when duplicate
-- names exist, so we only recreate it if no duplicates are present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT board_id, label FROM columns WHERE deleted_at IS NULL
    GROUP BY board_id, label HAVING count(*) > 1
  ) THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS columns_board_id_label_key ON columns (board_id, label)';
    EXCEPTION WHEN OTHERS THEN
      -- leave as no-op if creation fails
      NULL;
    END;
  ELSE
    RAISE NOTICE 'Skipping recreate of unique index on columns(board_id,name): duplicate names exist.';
  END IF;
END $$;
