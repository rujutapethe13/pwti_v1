-- Migration 20260911000000: Remove leftover demo/test boards
--
-- ── Safety notice ─────────────────────────────────────────────────────────────
-- This migration previously deleted every board whose name matched a fuzzy
-- pattern (%may%, %june%, %july%, %august%, %test%, %demo%, %temp%, %tmp%)
-- with no workspace scoping, across 11 tables in dependency order. Because
-- migrations run on deploy, that meant any board a customer happened to name
-- "May Campaign" or "August Board" would be deleted along with its records and
-- cell values, in every environment this migration was applied to.
--
-- Board names are user-supplied text, not a safe key. Cleanup is now opt-in and
-- driven by an explicit list of board IDs. Nothing is deleted unless the
-- operator supplies that list.
--
-- To run the cleanup deliberately:
--
--   begin;
--   select set_config('app.cleanup_board_ids',
--                     '<board-uuid>,<board-uuid>', true);
--   -- paste the statements below into this transaction, then:
--   commit;
--
-- With no list set, this migration is a no-op: the target table below resolves
-- to zero rows, so every DELETE matches nothing and the deploy still succeeds.

do $$
declare
    target_ids text;
begin
    target_ids := current_setting('app.cleanup_board_ids', true);

    if target_ids is null or btrim(target_ids) = '' then
        raise notice using
            message = 'cleanup_demo_boards: skipped, no explicit board list supplied.',
            detail  = 'To run this cleanup deliberately, set a transaction-local list first, e.g. '
                      || 'select set_config(''app.cleanup_board_ids'', ''<uuid>,<uuid>'', true); '
                      || 'Boards are never selected by name, because board names are user-supplied '
                      || 'text and a pattern like ''%may%'' matches real customer data.';
    end if;
end;
$$;

-- ── Statements ───────────────────────────────────────────────────────────────
-- `target_board_ids` resolves to an empty set when app.cleanup_board_ids is
-- absent, so every DELETE below matches zero rows and the migration is a no-op.

drop table if exists target_board_ids;

create temporary table target_board_ids as
select id
from public.boards
where id = any (
    coalesce(
        string_to_array(nullif(btrim(current_setting('app.cleanup_board_ids', true)), ''), ',')::uuid[],
        '{}'::uuid[]
    )
);

-- Delete cell values, then records, then the dependent metadata tables, then
-- the boards themselves. Order matters: every child goes before its parent.

delete from public.cell_values
where column_id in (
    select id from public.columns where board_id in (select id from target_board_ids)
);

delete from public.column_dependencies
where source_column_id in (
    select id from public.columns where board_id in (select id from target_board_ids)
)
   or target_column_id in (
    select id from public.columns where board_id in (select id from target_board_ids)
);

delete from public.derived_values
where column_id in (
    select id from public.columns where board_id in (select id from target_board_ids)
);

delete from public.search_index
where board_id in (select id from target_board_ids);

delete from public.dependency_graph_edges
where board_id in (select id from target_board_ids);

delete from public.relationships
where source_board_id in (select id from target_board_ids)
   or target_board_id in (select id from target_board_ids);

delete from public.groups
where board_id in (select id from target_board_ids);

delete from public.views
where board_id in (select id from target_board_ids);

delete from public.columns
where board_id in (select id from target_board_ids);

delete from public.records
where board_id in (select id from target_board_ids);

delete from public.boards
where id in (select id from target_board_ids);

-- Report what was actually removed.
do $$
declare
    removed integer;
begin
    get diagnostics removed = row_count;
    raise notice 'cleanup_demo_boards: removed % board row(s)', removed;
end;
$$;

drop table target_board_ids;