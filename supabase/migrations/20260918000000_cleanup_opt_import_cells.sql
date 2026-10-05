-- Migration 20260918: Clean up opt-import-* placeholder values in dropdown/status/priority cells
--
-- Context
--   The import path (applyOptionMappingsToColumns) was creating new dropdown
--   options with IDs like "opt-import-<timestamp>-<n>". Cell values stored
--   these IDs. Display code (chart view, calendar view) treats opt-import-*
--   as internal traceability metadata — hiding it from the UI entirely.
--   This means cells that correctly reference a valid option still appear
--   blank or show the raw internal ID instead of the readable label.
--
-- This migration finds all cell_values containing opt-import-* patterns
-- and rewrites them to the human-readable label from the matching column
-- option. If no matching option exists, the label is derived from the ID.
--
-- Idempotent: re-running finds 0 matching rows once all are resolved.

-- ── Derive a human-friendly label from an option id ──────────────────────────
create or replace function public.derive_label_from_option_id(p_id text)
returns text
language sql
stable
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(p_id, '^(opt[-_]import[-_]\d+[-_])', '', 'i'),
      '^(opt[-_])', '', 'i'
    ),
    '^(col[-_]import[-_])', '', 'i'
  );
$$;

-- ── Fix empty labels on opt-import-* options in column settings ──────────────
create or replace function public.repair_opt_import_labels()
returns int
language plpgsql
as $$
declare
  rec record;
  fixed int := 0;
  v_new_opts jsonb;
  v_elem jsonb;
  v_id text;
  v_label text;
  v_derived text;
begin
  for rec in
    select c.id as column_id, c.settings->'options' as opts
    from public.columns c
    where c.type in ('status', 'priority', 'dropdown')
      and c.settings ? 'options'
      and exists (
        select 1 from jsonb_array_elements(c.settings->'options') elem
        where elem->>'id' like 'opt-import-%'
      )
  loop
    v_new_opts := '[]'::jsonb;
    for v_elem in select elem from jsonb_array_elements(rec.opts) elem loop
      v_id := nullif(v_elem->>'id', '');
      v_label := nullif(v_elem->>'label', '');

      if v_id is null then
        v_new_opts := v_new_opts || v_elem;
        continue;
      end if;

      if v_label is null or v_label = '' then
        v_derived := public.derive_label_from_option_id(v_id);
        v_label := case when v_derived is null or v_derived = '' then v_id else v_derived end;
        v_elem := jsonb_build_object('id', v_id, 'label', v_label);
        fixed := fixed + 1;
      end if;

      v_new_opts := v_new_opts || v_elem;
    end loop;

    update public.columns
      set settings = jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY['options'], v_new_opts, true),
          updated_at = now()
      where id = rec.column_id;
  end loop;

  return fixed;
end;
$$;

-- ── Rewrite cell values referencing opt-import-* IDs ─────────────────────────
create or replace function public.rewrite_opt_import_cell_values()
returns int
language plpgsql
as $$
declare
  rec record;
  v_option_label text;
  v_derived text;
  fixed int := 0;
begin
  -- First fix any empty option labels
  perform public.repair_opt_import_labels();

  -- Process each cell value containing opt-import-*
  for rec in
    select cv.id as cell_id, cv.board_id, cv.record_id, cv.column_id,
           cv.value, cv.value_text,
           c.settings->'options' as col_options
    from public.cell_values cv
    join public.columns c on c.id = cv.column_id and c.board_id = cv.board_id
    where cv.value is not null
      and cv.value::text ~ '^opt-import-\d'
      and c.type in ('status', 'priority', 'dropdown')
  loop
    v_option_label := null;

    -- Try to find a matching option with a label
    if jsonb_typeof(rec.col_options) = 'array' then
      select elem->>'label' into v_option_label
      from jsonb_array_elements(rec.col_options) elem
      where elem->>'id' = rec.value::text
      limit 1;
    end if;

    if v_option_label is not null and v_option_label <> '' then
      -- Option exists with a proper label: replace cell value with the label
      update public.cell_values
        set value = to_jsonb(v_option_label),
            value_text = v_option_label,
            updated_at = now()
        where id = rec.cell_id;
    else
      -- No matching option: derive a label from the ID
      v_derived := public.derive_label_from_option_id(rec.value::text);
      if v_derived is null or v_derived = '' then
        v_derived := rec.value::text;
      end if;

      update public.cell_values
        set value = to_jsonb(v_derived),
            value_text = v_derived,
            updated_at = now()
        where id = rec.cell_id;
    end if;

    fixed := fixed + 1;
  end loop;

  return fixed;
end;
$$;

-- ── Run the cleanup ──────────────────────────────────────────────────────────
do $$
declare
  v_fixed int;
  v_labels int;
begin
  select public.repair_opt_import_labels() into v_labels;
  raise notice 'repair_opt_import_labels: % option labels fixed', v_labels;

  select public.rewrite_opt_import_cell_values() into v_fixed;
  raise notice 'rewrite_opt_import_cell_values: % cell values rewritten', v_fixed;
end;
$$;
