-- Mirror settings v2: preserve legacy keys while allowing multi-column settings.
-- Apply manually after the existing mirror migration.

UPDATE public.columns
SET settings = settings
  || jsonb_build_object(
    'sourceRelationColumnId', settings->>'source_connect_column_id',
    'items', COALESCE(settings->'mirrored_columns',
      CASE WHEN settings ? 'mirrored_column_id'
        THEN jsonb_build_array(jsonb_build_object(
          'column_id', settings->>'mirrored_column_id',
          'board_id', '',
          'aggregation', settings->'display_config'->'aggregation'
        ))
        ELSE '[]'::jsonb END),
    'showItemName', false,
    'combineAs', 'stack',
    'maxVisible', 3
  )
WHERE type = 'mirror';

CREATE OR REPLACE FUNCTION public.validate_mirror_column_settings()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  s jsonb := coalesce(new.settings, '{}'::jsonb);
BEGIN
  IF new.type <> 'mirror' THEN RETURN new; END IF;
  IF jsonb_typeof(s->'source_connect_column_id') <> 'string'
     AND jsonb_typeof(s->'sourceRelationColumnId') <> 'string' THEN
    RAISE EXCEPTION 'mirror settings require a source relation column';
  END IF;
  IF NOT (
    jsonb_typeof(s->'mirrored_column_id') = 'string'
    OR (jsonb_typeof(s->'mirrored_columns') = 'array' AND jsonb_array_length(s->'mirrored_columns') > 0)
    OR (jsonb_typeof(s->'items') = 'array' AND jsonb_array_length(s->'items') > 0)
  ) THEN
    RAISE EXCEPTION 'mirror settings require at least one source column';
  END IF;
  RETURN new;
END;
$$;
