-- ─────────────────────────────────────────────────────────────────────────────
-- Client 360 Backfill Script
--
-- One-off script that runs the full Client 360 snapshot refresh against ALL
-- existing historical records.  Uses the same logic as the scheduled
-- refresh_client_360_snapshot() function — no separate code path.
--
-- Usage (in Supabase SQL Editor or psql):
--   \i supabase/scripts/client_360_backfill.sql
--
-- Safe to re-run: every step is idempotent (upserts with ON CONFLICT,
-- auto-detected mappings are deleted before re-insert, temporary tables
-- drop on commit).  Re-running simply refreshes the snapshot.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Verify prerequisites ─────────────────────────────────────────────────────
do $$
declare
    v_col_count int;
    v_rec_count int;
    v_cell_count int;
    v_board_count int;
begin
    select count(*) into v_col_count from public.columns;
    select count(*) into v_rec_count from public.records;
    select count(*) into v_cell_count from public.cell_values;

    raise notice '[Backfill] Prerequisites: % columns, % records, % cell_values',
        v_col_count, v_rec_count, v_cell_count;

    if v_col_count = 0 then
        raise exception 'No columns found — has the core metadata migration run?';
    end if;

    -- Confirm no board-level pagination cap (log total boards for the org)
    select count(distinct board_id) into v_board_count from public.records where status = 'active';
    raise notice '[Backfill] Total boards with active records: % (no cap — processing all)', v_board_count;
exception
    when undefined_table then
        raise exception 'Core metadata tables not found — run earlier migrations first';
end;
$$;

-- ── Step 1: Run the full snapshot refresh ────────────────────────────────────
-- refresh_client_360_snapshot() internally calls:
--   1. upsert_client_360_field_mappings()   — auto-detect columns per board
--   2. seed_client_360_client_aliases()     — resolve client name variants
--   3. Auto-populate client_360_status_mappings
--   4. INSERT ... ON CONFLICT into client_360_daily_snapshot (with due_date, status, is_pending)
-- Safe to re-run: every step is idempotent (upserts with ON CONFLICT,
-- auto-detected mappings are deleted before re-insert, temp tables drop on commit).
select public.refresh_client_360_snapshot() as (rows_upserted);

-- ── Step 2: Verify the results ───────────────────────────────────────────────
do $$
declare
    v_total bigint;
    v_with_client bigint;
    v_with_date bigint;
    v_with_due_date bigint;
    v_with_volume bigint;
    v_with_status bigint;
    v_with_pending bigint;
    v_confirmed_clients bigint;
    v_flagged_clients bigint;
begin
    select count(*) into v_total from public.client_360_daily_snapshot;
    select count(*) into v_with_client from public.client_360_daily_snapshot where client_id is not null;
    select count(*) into v_with_date from public.client_360_daily_snapshot where job_date is not null;
    select count(*) into v_with_due_date from public.client_360_daily_snapshot where due_date is not null;
    select count(*) into v_with_volume from public.client_360_daily_snapshot where volume > 1;
    select count(*) into v_with_status from public.client_360_daily_snapshot where status is not null;
    select count(*) into v_with_pending from public.client_360_daily_snapshot where is_pending is not null;
    select count(*) into v_confirmed_clients from public.client_360_clients where needs_confirmation = false;
    select count(*) into v_flagged_clients from public.client_360_clients where needs_confirmation = true;

    raise notice '[Backfill] Snapshot rows: %', v_total;
    raise notice '[Backfill]   With client_id: %', v_with_client;
    raise notice '[Backfill]   With job_date: %', v_with_date;
    raise notice '[Backfill]   With due_date: %', v_with_due_date;
    raise notice '[Backfill]   With volume > 1: %', v_with_volume;
    raise notice '[Backfill]   With status: %', v_with_status;
    raise notice '[Backfill]   With is_pending: %', v_with_pending;
    raise notice '[Backfill] Clients (confirmed): %', v_confirmed_clients;
    raise notice '[Backfill] Clients (need confirmation): %', v_flagged_clients;
end;
$$;

-- ── Sample query for spot-checking (acceptance check) ────────────────────────
-- Run this manually to verify status / is_pending groupings:
--
-- SELECT status, is_pending, COUNT(*)
-- FROM public.client_360_daily_snapshot
-- GROUP BY 1, 2
-- ORDER BY 1, 2;
--
-- Run this to confirm boards processed is not capped at 20:
--
-- SELECT count(distinct board_id) FROM public.client_360_daily_snapshot;
--
-- Check the log output from refresh_client_360_snapshot() which logs:
--   [Client 360 Snapshot] Processing N boards for organization
-- Where N should equal the total boards with active records for the org (no cap).
