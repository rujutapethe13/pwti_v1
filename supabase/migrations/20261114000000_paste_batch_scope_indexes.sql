-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20261114000000: Paste-batch scope-verification indexes
--
-- The bulk paste path (bulkUpdateCells / bulkUpdateRecordTitles) now verifies
-- board membership before writing. Each verification query filters on both
-- board_id and id IN (...):
--
--   columns:   .eq("board_id", boardId).in("id", columnIds)
--   records:   .eq("board_id", boardId).in("id", recordIds)
--
-- Existing indexes:
--   columns_board_id_idx(board_id, sort_order) — helps board_id prefix only,
--     then filters id IN(...) as a residual on every candidate row.
--   records_board_id_idx(board_id, created_at) — same problem for records.
--
-- A composite (board_id, id) index lets Postgres use an index-only scan for
-- the membership check, which matters most for large pastes (1000s of rows)
-- where the IN list is long.
--
-- Created with IF NOT EXISTS so re-running / manual application is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. columns(board_id, id) — column membership verification in bulk writes ──
create index if not exists columns_board_id_id_idx
    on public.columns (board_id, id);

-- 2. records(board_id, id) — record membership verification in bulk writes ──
create index if not exists records_board_id_id_idx
    on public.records (board_id, id);
