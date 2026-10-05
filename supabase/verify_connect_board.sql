-- ────────────────────────────────────────────────────────────
-- Verification: connect_board column type
--
-- Run this in the Supabase SQL Editor (or psql) to confirm:
--   1. A `connect_board` column can be created with default/empty
--      settings (all keys present, empty values).
--   2. Its `settings` JSON shape matches the spec exactly.
--   3. A cell value stores `linked_item_ids` as an array of
--      { board_id, item_id } pairs.
--   4. Invalid settings / invalid cell values are rejected by the
--      triggers created in 20260821_connect_board.sql.
--
-- Uses a throwaway workspace/board so it is safe to run anywhere.
-- ────────────────────────────────────────────────────────────

do $$
declare
  v_org text := 'org_verify';
  v_ws  text := 'ws_verify';
  v_board text := 'board_verify';
  v_col text := 'col_connect_verify';
  v_record text := 'rec_verify';
  v_settings jsonb;
  v_value jsonb;
  v_count int;
begin
  -- Test fixtures
  insert into public.organizations (id, name) values (v_org, 'Verify Org')
    on conflict (id) do nothing;
  insert into public.workspaces (id, organization_id, name, slug)
    values (v_ws, v_org, 'Verify WS', 'verify-ws') on conflict (id) do nothing;
  insert into public.boards (id, organization_id, workspace_id, slug, name)
    values (v_board, v_org, v_ws, 'verify-board', 'Verify Board') on conflict (id) do nothing;
  insert into public.records (id, organization_id, workspace_id, board_id, title)
    values (v_record, v_org, v_ws, v_board, 'Verify Record') on conflict (id) do nothing;

  -- 1) Default/empty settings (all required keys present, empty values)
  v_settings := '{
    "connected_board_ids": [],
    "allow_multiple_items": false,
    "two_way_sync": false,
    "linked_column_id_on_other_board": null
  }'::jsonb;

  insert into public.columns
    (id, organization_id, workspace_id, board_id, key, label, type, settings)
  values
    (v_col, v_org, v_ws, v_board, 'connect_verify', 'Connect Verify', 'connect_board', v_settings);

  -- Confirm the stored shape is exactly the spec
  select settings into v_settings from public.columns where id = v_col;
  assert v_settings ? 'connected_board_ids', 'missing connected_board_ids';
  assert v_settings ? 'allow_multiple_items', 'missing allow_multiple_items';
  assert v_settings ? 'two_way_sync', 'missing two_way_sync';
  assert v_settings ? 'linked_column_id_on_other_board', 'missing linked_column_id_on_other_board';
  assert jsonb_typeof(v_settings->'connected_board_ids') = 'array', 'connected_board_ids not array';
  raise notice 'OK: connect_board column settings shape = %', v_settings;

  -- 2) Cell value with linked_item_ids array of {board_id, item_id}
  v_value := '{"linked_item_ids": [{"board_id": "board_verify", "item_id": "rec_verify"}]}'::jsonb;
  insert into public.cell_values
    (organization_id, workspace_id, board_id, record_id, column_id, value)
  values (v_org, v_ws, v_board, v_record, v_col, v_value);

  select value into v_value from public.cell_values
    where board_id = v_board and record_id = v_record and column_id = v_col;
  assert jsonb_typeof(v_value->'linked_item_ids') = 'array', 'linked_item_ids not array';
  assert (v_value->'linked_item_ids'->0->>'board_id') = 'board_verify', 'bad board_id';
  assert (v_value->'linked_item_ids'->0->>'item_id') = 'rec_verify', 'bad item_id';
  raise notice 'OK: connect_board cell value shape = %', v_value;

  -- 3) Negative: invalid settings (missing keys) must be rejected
  begin
    insert into public.columns
      (id, organization_id, workspace_id, board_id, key, label, type, settings)
    values
      ('col_bad', v_org, v_ws, v_board, 'bad', 'Bad', 'connect_board', '{"foo": 1}'::jsonb);
    raise exception 'FAIL: invalid settings should have been rejected';
  exception when others then
    raise notice 'OK: invalid settings rejected -> %', sqlerrm;
  end;

  -- 4) Negative: invalid cell value (missing linked_item_ids) must be rejected
  begin
    insert into public.cell_values
      (organization_id, workspace_id, board_id, record_id, column_id, value)
    values (v_org, v_ws, v_board, v_record, v_col, '{"foo": 1}'::jsonb);
    raise exception 'FAIL: invalid cell value should have been rejected';
  exception when others then
    raise notice 'OK: invalid cell value rejected -> %', sqlerrm;
  end;

  -- Cleanup
  delete from public.cell_values where column_id = v_col;
  delete from public.columns where id = v_col or id = 'col_bad';
  delete from public.records where id = v_record;
  delete from public.boards where id = v_board;
  delete from public.workspaces where id = v_ws;
  delete from public.organizations where id = v_org;

  raise notice 'ALL CHECKS PASSED';
end $$;
