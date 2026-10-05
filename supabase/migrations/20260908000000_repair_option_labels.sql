-- Migration 20260908: Ensure dropdown/status/priority options always have a display label
--
-- Context
--   Some imported or manually-edited option lists contain entries where the
--   `label` field is missing, null, or empty. When that happens the pie-chart
--   legend, exports, and filters can fall back to the raw internal option id
--   (e.g. "opt-import-1725238400000-abc1234") instead of a human-readable
--   name.
--
-- This migration normalizes every option array to the object shape
-- `{ id, label, color? }` and backfills any empty/missing label from the
-- option id by stripping well-known prefixes. It is idempotent and safe to
-- run on fresh installs.

-- ── Helper: normalize a jsonb options array into (id, label) rows ──────────
create or replace function public.normalize_option_labels(p_options jsonb)
returns table(opt_id text, opt_label text)
language sql
stable
as $$
  select
    case jsonb_typeof(elem)
      when 'object' then elem->>'id'
      else trim(both '"' from elem::text)
    end as opt_id,
    case jsonb_typeof(elem)
      when 'object' then nullif(elem->>'label', '')
      else trim(both '"' from elem::text)
    end as opt_label
  from jsonb_array_elements(p_options) as elem;
$$;

-- ── Derive a human-friendly label from an option id ─────────────────────────
create or replace function public.derive_option_label(p_id text)
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

-- ── Repair one column's option list ─────────────────────────────────────────
create or replace function public.repair_option_labels(
  p_board_id text,
  p_column_id text
)
returns table(options_fixed int)
language plpgsql
as $$
declare
  v_type text;
  v_opts jsonb;
  v_fixed int := 0;
  v_elem jsonb;
  v_id text;
  v_label text;
  v_derived text;
  v_new_opts jsonb := '[]'::jsonb;
begin
  select type, coalesce(settings->'options', '[]'::jsonb)
    into v_type, v_opts
  from public.columns
  where id = p_column_id and board_id = p_board_id;

  if not found or v_type not in ('status', 'priority', 'dropdown') then
    return query select 0;
  end if;

  if v_opts is null or jsonb_array_length(v_opts) = 0 then
    return query select 0;
  end if;

  for v_elem in select elem from jsonb_array_elements(v_opts) elem loop
    v_id := nullif(v_elem->>'id', '');
    v_label := nullif(v_elem->>'label', '');

    if v_id is null then
      v_new_opts := v_new_opts || v_elem;
      continue;
    end if;

    if v_label is null or v_label = '' then
      v_derived := public.derive_option_label(v_id);
      if v_derived is null or v_derived = '' then
        v_label := v_id;
      else
        v_label := v_derived;
      end if;
      v_elem := jsonb_build_object('id', v_id, 'label', v_label);
      v_fixed := v_fixed + 1;
    end if;

    v_new_opts := v_new_opts || v_elem;
  end loop;

  if v_fixed > 0 then
    update public.columns
       set settings = jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY['options'], v_new_opts, true),
           updated_at = now()
     where id = p_column_id;
  end if;

  return query select v_fixed;
end;
$$;

-- ── Repair every option-style column on a board ─────────────────────────────
create or replace function public.repair_option_labels_in_board(
  p_board_id text
)
returns table(options_fixed int)
language plpgsql
as $$
declare
  r record;
  col_fixed int;
  total_fixed int := 0;
begin
  for r in
    select id
    from public.columns
    where board_id = p_board_id
      and type in ('status', 'priority', 'dropdown')
  loop
    select options_fixed into col_fixed
      from public.repair_option_labels(p_board_id, r.id);
    total_fixed := total_fixed + coalesce(col_fixed, 0);
  end loop;

  return query select total_fixed;
end;
$$;

-- ── One-time backfill: run on every existing board ──────────────────────────
-- Idempotent: re-running reports 0 and performs no writes once all labels
-- are populated. Safe on fresh installs (no matching columns → no-op).
do $$
declare
  b_id text;
begin
  for b_id in
    select distinct board_id
    from public.columns
    where type in ('status', 'priority', 'dropdown')
  loop
    perform options_fixed
      from public.repair_option_labels_in_board(b_id);
  end loop;
end;
$$;
