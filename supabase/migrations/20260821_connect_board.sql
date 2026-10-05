-- ────────────────────────────────────────────────────────────
-- Migration 20260821: Connect Board column type
--
-- Adds first-class support for the `connect_board` column type.
--
-- Storage layer:
--   * `columns.settings` is already `jsonb`. We constrain the
--     settings *shape* for `connect_board` columns via a trigger so
--     the structure is guaranteed at the database boundary:
--       {
--         connected_board_ids:                 text[],
--         allow_multiple_items:               boolean,
--         two_way_sync:                       boolean,
--         linked_column_id_on_other_board:    text | null
--       }
--   * `cell_values.value` is already `jsonb`. For `connect_board`
--     columns it holds:
--       { "linked_item_ids": [ { "board_id": text, "item_id": text }, ... ] }
--     This shape is also enforced by a trigger.
--
-- No columns/columns.settings structural change is required because
-- both are already JSON columns; this migration documents the
-- contract and enforces it.
-- ────────────────────────────────────────────────────────────

-- Document the intended structure on the existing jsonb columns.
comment on column public.columns.settings is
  'Column-type-specific configuration. For type=connect_board this must be: { connected_board_ids: text[], allow_multiple_items: boolean, two_way_sync: boolean, linked_column_id_on_other_board: text|null }.';

comment on column public.cell_values.value is
  'Cell value. For connect_board columns this must be: { linked_item_ids: [{ board_id: text, item_id: text }] }.';

-- ── Trigger: validate columns.settings for connect_board ───
create or replace function public.validate_connect_board_column_settings()
returns trigger
language plpgsql
as $$
declare
  v_settings jsonb := coalesce(new.settings, '{}'::jsonb);
begin
  if new.type <> 'connect_board' then
    return new;
  end if;

  if not (v_settings ? 'connected_board_ids'
            and v_settings ? 'allow_multiple_items'
            and v_settings ? 'two_way_sync'
            and v_settings ? 'linked_column_id_on_other_board') then
    raise exception 'connect_board columns require settings: connected_board_ids, allow_multiple_items, two_way_sync, linked_column_id_on_other_board';
  end if;

  if jsonb_typeof(v_settings->'connected_board_ids') <> 'array' then
    raise exception 'connect_board settings.connected_board_ids must be an array of board ids';
  end if;

  if jsonb_typeof(v_settings->'allow_multiple_items') <> 'boolean' then
    raise exception 'connect_board settings.allow_multiple_items must be a boolean';
  end if;

  if jsonb_typeof(v_settings->'two_way_sync') <> 'boolean' then
    raise exception 'connect_board settings.two_way_sync must be a boolean';
  end if;

  if not (jsonb_typeof(v_settings->'linked_column_id_on_other_board') in ('string', 'null')) then
    raise exception 'connect_board settings.linked_column_id_on_other_board must be a string or null';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_connect_board_column_settings on public.columns;
create trigger trg_validate_connect_board_column_settings
  before insert or update on public.columns
  for each row
  execute function public.validate_connect_board_column_settings();

-- ── Trigger: validate cell_values.value for connect_board ──
-- SECURITY DEFINER: the function must SELECT from public.columns to determine
-- the column type. The columns table has RLS enabled, so SECURITY INVOKER
-- would fail with 42501 (insufficient_privilege) for users who can't read
-- columns through their RLS policy. The function is read-only and only
-- checks the column type — no data mutation or exfiltration is possible.
create or replace function public.validate_connect_board_cell_value()
returns trigger
language plpgsql
security definer
as $$
declare
  v_column_type text;
  v_value jsonb := new.value;
begin
  select type into v_column_type from public.columns where id = new.column_id;
  if v_column_type is distinct from 'connect_board' then
    return new;
  end if;

  if v_value is null then
    return new;
  end if;

  if jsonb_typeof(v_value) <> 'object' or not (v_value ? 'linked_item_ids') then
    raise exception 'connect_board cell value must be an object with a linked_item_ids array';
  end if;

  if jsonb_typeof(v_value->'linked_item_ids') <> 'array' then
    raise exception 'connect_board cell value.linked_item_ids must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_value->'linked_item_ids') as item
    where jsonb_typeof(item->'board_id') <> 'string'
       or jsonb_typeof(item->'item_id') <> 'string'
  ) then
    raise exception 'connect_board cell value.linked_item_ids entries must each have string board_id and item_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_connect_board_cell_value on public.cell_values;
create trigger trg_validate_connect_board_cell_value
  before insert or update on public.cell_values
  for each row
  execute function public.validate_connect_board_cell_value();

-- Helpful index for resolving connected items by board.
create index if not exists cell_values_connect_board_idx
  on public.cell_values using gin ((value->'linked_item_ids'))
  where value is not null and value ? 'linked_item_ids';
