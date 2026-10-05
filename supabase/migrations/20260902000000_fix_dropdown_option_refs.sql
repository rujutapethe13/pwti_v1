-- Migration 20260902: Dropdown option-list integrity for imported cells
--
-- Context
--   A prior import path wrote the raw text/value of a mapped dropdown column
--   (e.g. "Type of Job") straight into each row's cell as a freeform string,
--   without registering those values as options in the column's
--   `settings.options` array. As a result the cell *display* showed the value,
--   but opening the dropdown revealed an empty list (only "Edit Labels" /
--   "+ New label"), because the dropdown's option list is the single source
--   of truth and cell values are meant to be foreign keys (option ids) into it.
--
-- Contract enforced by this migration
--   * `columns.settings.options` is the single source of truth for dropdown /
--     status / priority columns.
--   * Every option is an object: { id: text, label: text, color?: text }.
--     (Legacy string-only option arrays are still readable — see
--     `normalize_dropdown_options` — but new writes use the object form.)
--   * A cell value for a dropdown-style column is an option id foreign key,
--     NOT a freeform label string.
--
-- This migration adds two idempotent repair functions that can be run as a
-- one-time fix pass against already-imported boards (requirement #3):
--   * `repair_dropdown_column(board_id, column_id)` — fixes one column.
--   * `repair_dropdown_columns_in_board(board_id)` — fixes every dropdown
--     column on a board, summing the work performed.
--
-- Example:
--   select * from repair_dropdown_columns_in_board('board-abc123');

-- ── Helper: normalize a jsonb options array into (id, lower(label)) rows ──
create or replace function public.normalize_dropdown_options(p_options jsonb)
returns table(opt_id text, opt_label_lower text)
language sql
stable
as $$
  select
    case jsonb_typeof(elem)
      when 'object' then elem->>'id'
      else trim(both '"' from elem::text)
    end as opt_id,
    lower(
      case jsonb_typeof(elem)
        when 'object' then (elem->>'label')
        else trim(both '"' from elem::text)
      end
    ) as opt_label_lower
  from jsonb_array_elements(p_options) as elem;
$$;

-- ── Repair a single dropdown-style column ────────────────────────────────
create or replace function public.repair_dropdown_column(
  p_board_id text,
  p_column_id text
)
returns table(options_added int, cells_relinked int)
language plpgsql
as $$
declare
  v_type              text;
  v_opts              jsonb;
  v_cell_record       text;
  v_cell_value        text;
  v_val               text;
  v_match_id          text;
  v_new_id            text;
  added               int := 0;
  relinked            int := 0;
begin
  select type, coalesce(settings->'options', '[]'::jsonb)
    into v_type, v_opts
  from public.columns
  where id = p_column_id and board_id = p_board_id;

  -- Only repair dropdown-style columns; everything else is a no-op.
  if found and v_type in ('status', 'priority', 'dropdown') then
    if v_opts is null then
      v_opts := '[]'::jsonb;
    end if;

    -- Working set of known options (id + lowercased label). Recreated each call
    -- so the function is safely re-runnable / idempotent.
    create temporary table if not exists _rep_known (
      opt_id          text,
      opt_label_lower text
    ) on commit drop;
    truncate _rep_known;

    insert into _rep_known (opt_id, opt_label_lower)
    select opt_id, opt_label_lower
    from public.normalize_dropdown_options(v_opts);

    -- Scan every cell for this column. Cells already referencing a known
    -- option id are skipped; cells holding a raw label are relinked to the
    -- matching option id (creating one if it does not yet exist).
    for v_cell_record, v_cell_value in
      select c.record_id, c.value_text::text
      from public.cell_values c
      where c.board_id = p_board_id
        and c.column_id = p_column_id
        and c.value_text is not null
    loop
      v_val := trim(v_cell_value);
      if length(v_val) = 0 then
        continue;
      end if;

      -- Already a known option id? Leave it alone.
      select opt_id into v_match_id
      from _rep_known
      where opt_id = v_val
      limit 1;
      if found then
        continue;
      end if;

      -- Matches an existing option's label (case-insensitive) -> relink.
      select opt_id into v_match_id
      from _rep_known
      where opt_label_lower = lower(v_val)
      limit 1;
      if found then
        update public.cell_values
           set value = to_jsonb(v_match_id),
               value_text = v_match_id,
               updated_at = now()
         where board_id = p_board_id
           and record_id = v_cell_record
           and column_id = p_column_id;
        relinked := relinked + 1;
        continue;
      end if;

      -- Raw label with no matching option -> create one and relink.
      v_new_id := gen_random_uuid()::text;
      v_opts := v_opts || jsonb_build_object('id', v_new_id, 'label', v_val);
      insert into _rep_known values (v_new_id, lower(v_val));

      update public.cell_values
         set value = to_jsonb(v_new_id),
             value_text = v_new_id,
             updated_at = now()
       where board_id = p_board_id
         and record_id = v_cell_record
         and column_id = p_column_id;
      relinked := relinked + 1;
      added := added + 1;
    end loop;

    -- Persist the reconciled options array (create the key if it was missing).
    if added > 0 then
      update public.columns
         set settings = jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY['options'], v_opts, true),
             updated_at = now()
       where id = p_column_id;
    end if;
  end if;

  return query select added, relinked;
end;
$$;

-- ── Repair every dropdown-style column on a board ───────────────────────
create or replace function public.repair_dropdown_columns_in_board(
  p_board_id text
)
returns table(options_added int, cells_relinked int)
language plpgsql
as $$
declare
  r               record;
  col_added       int;
  col_relinked    int;
  total_added     int := 0;
  total_relinked  int := 0;
begin
  for r in
    select id
    from public.columns
    where board_id = p_board_id
      and type in ('status', 'priority', 'dropdown')
  loop
    select options_added, cells_relinked
      into col_added, col_relinked
      from public.repair_dropdown_column(p_board_id, r.id);
    total_added := total_added + coalesce(col_added, 0);
    total_relinked := total_relinked + coalesce(col_relinked, 0);
  end loop;

  return query select total_added, total_relinked;
end;
$$;

-- ── One-time data-migration: run the repair pass on every existing board ───
-- Idempotent: re-running a repaired board reports (0, 0) and performs no
-- writes. Safe to apply on fresh installs (no dropdown columns yet → no-op).
do $$
declare
  b_id text;
begin
  for b_id in
    select distinct board_id
    from public.columns
    where type in ('status', 'priority', 'dropdown')
  loop
    perform options_added, cells_relinked
    from public.repair_dropdown_columns_in_board(b_id);
  end loop;
end;
$$;
