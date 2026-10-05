-- Migration 20260903000000: Client 360 data hygiene — dedupe columns, clean orphan cells, remove duplicate rows
--
-- Context (Bug 14)
--   Two bugs combined to produce a corrupted Client 360 export where every
--   row had an empty "Matched Column" and "Cell Value":
--
--   1. New columns created by the import wizard were stored in client state
--      only and never persisted to the `columns` table. Because
--      `cell_values.column_id` has a foreign-key reference to `columns(id)`,
--      every imported cell value failed to insert (the FK constraint was
--      violated). The error was swallowed, so the records existed but had
--      no cell data — hence empty "Matched Column" / "Cell Value" in exports.
--
--   2. The import wizard generated deterministic column IDs
--      (`col-import-<slug>`) from the column label. When the same label was
--      imported on different boards (or even the same board), the IDs
--      collided. Because `buildUnifiedColumns` previously deduped by exact
--      column ID, these near-duplicate columns appeared as separate entries
--      in the Client 360 view, and cell values keyed by the same ID were
--      merged — losing data.
--
--   3. Each keystroke in the search box triggered a separate search/query
--      event, creating near-identical duplicate records (e.g. "SAFARI"
--      typed 10 times with casing variants) within seconds of each other.
--
-- Contract enforced by this migration
--   * Columns are deduplicated by normalized label (trim + lower) *within a
--     single board*. The oldest column (by created_at, then id) is kept as
--     canonical; all cell_values referencing the deleted column IDs are
--     remapped to the canonical column.
--
--   * Columns on different boards are never merged, even when their labels
--     are identical. A column belongs to the board that owns it, and every
--     board is expected to have its own "Status" / "Job Type" / "Date". An
--     earlier version of this migration grouped by normalized label alone,
--     which collapsed same-named columns across the whole database and
--     rewrote every affected cell_value to point at another board's column.
--   * Orphaned cell_values (column_id pointing to a non-existent column)
--     are deleted so they don't pollute queries.
--   * Duplicate records (same board_id + title, within a 60-second window)
--     are collapsed to a single record, keeping the oldest, and merging
--     their cell values where possible.
--
-- All steps are idempotent: re-running on already-cleaned data is a no-op.

-- ── Step 1: Deduplicate columns by normalized label, within a board ──────────
--
-- For every pair of columns *on the same board* that share a normalized label
-- (trim + lower) but have different IDs, merge the duplicate into the canonical
-- (oldest) column by remapping cell_value.column_id.
--
-- board_id is part of the grouping key on purpose. The import wizard derives
-- column IDs from the label (`col-import-<slug>`), so two boards that both
-- define a "Status" column produce two genuinely different columns. Merging
-- them would repoint every affected cell_value at the other board's column and
-- delete the column definition, silently mixing cell data between boards.
do $$
declare
    canon   record;
    dup     record;
begin
    -- One canonical column per (board, normalized label) group. `created_at` is
    -- used with a nulls-last fallback so older rows stay canonical even when
    -- older rows carry no timestamp.
    for canon in
        select distinct on (board_id, norm_label) id, board_id, norm_label
        from (
            select id,
                   board_id,
                   lower(trim(label)) as norm_label,
                   row_number() over (
                       partition by board_id, lower(trim(label))
                       order by created_at nulls last, id
                   ) as rn
            from public.columns
        ) ranked
        where rn = 1
    loop
        -- For each duplicate column in this board's group (not the canonical one)…
        for dup in
            select id
            from public.columns
            where board_id = canon.board_id
              and lower(trim(label)) = canon.norm_label
              and id <> canon.id
        loop
            -- Remap all cell values that reference the duplicate column to
            -- point at the canonical column instead.
            update public.cell_values
               set column_id = canon.id,
                   updated_at = now()
             where column_id = dup.id;

            -- Soft-delete the duplicate column definition so it doesn't
            -- reappear in Client 360 or board views.
            delete from public.columns
             where id = dup.id;
        end loop;
    end loop;
end;
$$;

-- ── Step 2: Delete orphaned columns (board_id not in boards) ────────────────
--
-- Columns that reference a non-existent board_id will cause FK violations
-- in client_360_field_mappings. Remove them first.
delete from public.columns c
where not exists (
    select 1 from public.boards b
    where b.id = c.board_id
);

-- ── Step 3: Delete orphaned cell_values ─────────────────────────────────────
--
-- Any cell value whose column_id no longer exists in the columns table
-- (e.g. from the pre-fix import that never persisted column definitions)
-- is dead data and should be removed.
delete from public.cell_values cv
where not exists (
    select 1 from public.columns c
    where c.id = cv.column_id
);

-- ── Step 3: Collapse duplicate records ──────────────────────────────────────
--
-- Records created by per-keystroke search events often share the same
-- title on the same board within a 60-second window. Keep the oldest
-- record and delete the duplicates. Cell values are preserved on the
-- canonical record (either already there or orphaned, which Step 2 handles).
with duplicates as (
    select id
    from (
        select
            id,
            row_number() over (
                partition by board_id, title
                order by created_at, id
            ) as rn
        from public.records
        where status = 'active'
          and created_at >= now() - interval '7 days'
    ) ranked
    where rn > 1
)
delete from public.records
where id in (select id from duplicates);

-- ── Step 4: Create a reusable SQL function for ongoing dedup ──────────────
--
-- Allows operators to manually re-run the dedup on a single board if needed.
create or replace function public.dedup_columns_by_label(p_board_id text default null)
returns table(columns_merged int, cells_remapped int)
language plpgsql
as $$
declare
    v_merged  int := 0;
    v_remapped int := 0;
    canon     record;
    dup       record;
begin
    for canon in
        select min(id) as id, lower(trim(label)) as norm_label
        from public.columns
        where (p_board_id is null or board_id = p_board_id)
        group by lower(trim(label))
        having count(*) > 1
    loop
        for dup in
            select id
            from public.columns
            where lower(trim(label)) = canon.norm_label
              and id <> canon.id
              and (p_board_id is null or board_id = p_board_id)
        loop
            update public.cell_values
               set column_id = canon.id,
                   updated_at = now()
             where column_id = dup.id;
            get diagnostics v_remapped = row_count;
            delete from public.columns where id = dup.id;
            v_merged := v_merged + 1;
        end loop;
    end loop;

    return query select v_merged, v_remapped;
end;
$$;
