-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20261102000000: Performance indexes for slow Overview / Client 360 loads
--
-- Three missing indexes were causing multi-minute page loads:
--
-- 1. cell_values(record_id, column_id) — the get_activity_items RPC and the
--    overview-drilldown / activity-tasks services each join cell_values 6-8
--    times per record on (record_id, column_id).  The only existing index is
--    (board_id, record_id), so every one of those joins was a sequential scan
--    of the whole cell_values table for every record.
--
-- 2. cell_values(column_id, record_id) — the services fetch candidate columns
--    with .in("column_id", candidateColIds) in paginated loops.  Without an
--    index led on column_id each page was a full scan.
--
-- 3. records(board_id, status, archived_at) — the paginated record fetches
--    filter on .in("board_id", ...), .eq("status", "active") and
--    .is("archived_at", null).  The existing (board_id, created_at) index only
--    helps the board_id prefix; the status / archived_at filters were applied
--    as a filter on every candidate row.
--
-- All three are created CONCURRENTLY-safe (IF NOT EXISTS) so re-running the
-- migration or applying it manually is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. cell_values(record_id, column_id) — RPC join hot path ────────────────────
create index if not exists cell_values_record_column_idx
    on public.cell_values (record_id, column_id);

-- 2. cell_values(column_id, record_id) — candidate-column paginated fetch ─────
create index if not exists cell_values_column_record_idx
    on public.cell_values (column_id, record_id);

-- 3. records(board_id, status, archived_at) — paginated active-record fetch ──
create index if not exists records_board_status_archived_idx
    on public.records (board_id, status, archived_at);

-- 4. Composite index on records(status, archived_at) for org-wide scans that
--    don't filter by board first (e.g. data-bounds queries).
create index if not exists records_status_archived_board_idx
    on public.records (status, archived_at, board_id);