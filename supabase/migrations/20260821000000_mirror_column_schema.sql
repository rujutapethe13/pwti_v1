-- Migration 20260821: Mirror column type schema
--
-- First-class support for the `mirror` column type.
--
-- Storage layer:
--   * `columns.settings` is already `jsonb`. We constrain the
--     settings *shape* for `mirror` columns via a trigger so the
--     structure is guaranteed at the database boundary:
--       {
--         source_connect_column_id: text,            -- which Connect Boards column this mirror rides on
--         mirrored_column_id:       text,            -- which column on the connected board(s) to pull from
--         display_config: {
--           aggregation: text | null                  -- "sum" | "average" | "latest" | null (single-item)
--         }
--       }
--   * `columns.default_value` remains `jsonb` and defaults to `null`
--     for mirror columns (mirrors are read-only).
--
-- No columns/settings structural change is required because
-- `columns.settings` is already JSON; this migration documents the
-- contract, enforces it, and indexes mirror columns for resolution.

-- Document the intended structure on the existing jsonb column.
comment on column public.columns.settings is
  'Column-type-specific configuration. For type=mirror this must be: { source_connect_column_id: text, mirrored_column_id: text, display_config: { aggregation: text|null } }.';

-- ── Trigger: validate columns.settings for mirror ────────────
create or replace function public.validate_mirror_column_settings()
returns trigger
language plpgsql
as $$
declare
  v_settings jsonb := coalesce(new.settings, '{}'::jsonb);
  v_display  jsonb;
begin
  if new.type <> 'mirror' then
    return new;
  end if;

  if not (v_settings ? 'source_connect_column_id'
            and v_settings ? 'mirrored_column_id'
            and v_settings ? 'display_config') then
    raise exception 'mirror columns require settings: source_connect_column_id, mirrored_column_id, display_config';
  end if;

  if jsonb_typeof(v_settings->'source_connect_column_id') <> 'string' then
    raise exception 'mirror settings.source_connect_column_id must be a string';
  end if;

  if jsonb_typeof(v_settings->'mirrored_column_id') <> 'string' then
    raise exception 'mirror settings.mirrored_column_id must be a string';
  end if;

  v_display := v_settings->'display_config';
  if jsonb_typeof(v_display) <> 'object' then
    raise exception 'mirror settings.display_config must be an object';
  end if;

  if not (jsonb_typeof(v_display->'aggregation') in ('string', 'null')) then
    raise exception 'mirror settings.display_config.aggregation must be a string or null';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_mirror_column_settings on public.columns;
create trigger trg_validate_mirror_column_settings
  before insert or update on public.columns
  for each row
  execute function public.validate_mirror_column_settings();

-- Index for resolving mirror columns that ride on a given Connect Boards column.
create index if not exists columns_mirror_source_idx
  on public.columns (board_id, (settings->>'source_connect_column_id'))
  where type = 'mirror';
