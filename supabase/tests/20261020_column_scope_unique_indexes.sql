-- Verification script: run in the Supabase SQL Editor.
-- Wrapped in a transaction that is ROLLED BACK, so nothing is persisted.
--
-- 1) re-add a soft-deleted column's label and key on the same board  -> must succeed
-- 2) two columns with the same label in the shared set (group_id NULL) -> must fail
-- 3) same label in a custom group AND in the shared set               -> must succeed

BEGIN;

-- pick a board that has at least one column
DO $$
DECLARE
  v_board text;
  v_org text;
  v_ws text;
  v_group text;
  v_col record;
BEGIN
  SELECT board_id, organization_id, workspace_id INTO v_board, v_org, v_ws
  FROM public.columns
  WHERE deleted_at IS NULL
  LIMIT 1;

  IF v_board IS NULL THEN
    RAISE NOTICE 'SKIP: no columns found';
    RETURN;
  END IF;

  RAISE NOTICE 'Using board %, org %, ws %', v_board, v_org, v_ws;

  -- (1) soft-delete a column, then re-add a new column with the same label and key
  SELECT id, key, label INTO v_col FROM public.columns
  WHERE board_id = v_board AND deleted_at IS NULL AND group_id IS NULL
  LIMIT 1;

  UPDATE public.columns SET deleted_at = now() WHERE id = v_col.id;

  BEGIN
    INSERT INTO public.columns
      (id, organization_id, workspace_id, board_id, key, label, type, required, hidden, frozen,
       default_value, settings, permissions, validation, version, sort_order, created_at, updated_at)
    VALUES
      (gen_random_uuid(), v_org, v_ws, v_board, v_col.key, v_col.label, 'text', false, false, false,
       null, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, 1, 999, now(), now());
    RAISE NOTICE 'TEST 1 PASS: re-adding a soft-deleted column label/key succeeded';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'TEST 1 FAIL: %', SQLERRM;
  END;

  -- (2) duplicate label inside the shared set -> must fail
  BEGIN
    INSERT INTO public.columns
      (id, organization_id, workspace_id, board_id, key, label, type, required, hidden, frozen,
       default_value, settings, permissions, validation, version, sort_order, created_at, updated_at)
    VALUES
      (gen_random_uuid(), v_org, v_ws, v_board, 'dup_label_test_key', v_col.label, 'text', false, false, false,
       null, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, 1, 998, now(), now());
    RAISE NOTICE 'TEST 2 FAIL: duplicate shared label was accepted (expected an error)';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST 2 PASS: duplicate shared label rejected (unique_violation)';
  END;

  -- (3) same label in a custom group and in the shared set -> must succeed
  SELECT id INTO v_group FROM public.groups WHERE board_id = v_board LIMIT 1;
  IF v_group IS NULL THEN
    INSERT INTO public.groups
      (id, organization_id, workspace_id, board_id, name, color, collapsed, sort_order, status, status_options, created_at, updated_at)
    VALUES
      (gen_random_uuid(), v_org, v_ws, v_board, 'scope test group', '#94a3b8', false, 9999, 'active', '[]'::jsonb, now(), now())
    RETURNING id INTO v_group;
    UPDATE public.groups SET column_mode = 'custom' WHERE id = v_group;
  ELSE
    UPDATE public.groups SET column_mode = 'custom' WHERE id = v_group;
  END IF;

  BEGIN
    INSERT INTO public.columns
      (id, organization_id, workspace_id, board_id, group_id, key, label, type, required, hidden, frozen,
       default_value, settings, permissions, validation, version, sort_order, created_at, updated_at)
    VALUES
      (gen_random_uuid(), v_org, v_ws, v_board, v_group, v_col.key, v_col.label, 'text', false, false, false,
       null, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, 1, 997, now(), now());
    RAISE NOTICE 'TEST 3 PASS: same label accepted in custom group % and in shared set', v_group;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'TEST 3 FAIL: %', SQLERRM;
  END;
END $$;

-- show the indexes that enforce the rules
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'columns' ORDER BY indexname;

ROLLBACK;
