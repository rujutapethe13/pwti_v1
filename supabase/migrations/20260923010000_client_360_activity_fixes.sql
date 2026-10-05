    -- ─────────────────────────────────────────────────────────────────────────────
    -- Migration 20260923010000: Client 360 Activity Dashboard fixes
    --
    -- Fixes three issues causing the Activity dashboard to show 0 for "Jobs received",
    -- "Clients active", and "Boards touched":
    --
    -- 1. DD-MM-YYYY date format not parsed:
    --    The _client_360_parse_date() function only handled ISO format (YYYY-MM-DD),
    --    Excel serials, and Slash-separated formats (DD/MM/YYYY, MM/DD/YYYY).
    --    Board cell values stored as DD-MM-YYYY (e.g. "23-09-2026" with dashes)
    --    were not recognized, causing job_date to be NULL — and NULL dates are
    --    excluded by the .gte()/.lte() filters in the daily-activity service.
    --
    -- 2. Boards without a "client" column excluded from snapshot:
    --    refresh_client_360_snapshot() used `inner join boards_having_client_mapping`
    --    which only kept records from boards that had a detected "client" column.
    --    Boards like "Trial" that only have a Date column (no Client column) were
    --    silently dropped, so their records never appeared in the snapshot at all.
    --
    -- 3. No auto-refresh on data change:
    --    The snapshot was only refreshed by pg_cron (hourly) or manual backfill.
    --    Newly added records were invisible until the next scheduled refresh.
    --    This migration adds an AFTER INSERT/UPDATE trigger on `records` and
    --    `cell_values` that marks a lightweight "dirty" flag, and the daily-
    --    activity API route now calls refresh_client_360_snapshot() before
    --    querying so freshly-added records appear immediately.
    -- ─────────────────────────────────────────────────────────────────────────────

    -- ── 1. Fix _client_360_parse_date to handle dash-separated date formats ───────

    create or replace function public._client_360_parse_date(p_text text)
    returns date
    language plpgsql
    strict
    as $$
    declare
        v_date date;
        v_num  numeric;
    begin
        if p_text is null or trim(p_text) = '' then
            return null;
        end if;

        -- Try direct PostgreSQL date cast (handles ISO 8601: YYYY-MM-DD, and
        -- timestamps like YYYY-MM-DDTHH:MM:SSZ — the ::date cast truncates to date)
        begin
            v_date := trim(p_text)::date;
            return v_date;
        exception when invalid_text_representation then
            null;
        end;

        -- Try Excel serial number (days since 1899-12-30)
        if trim(p_text) ~ '^[0-9]+\.?[0-9]*$' then
            begin
                v_num := trim(p_text)::numeric;
                return (date '1899-12-30' + v_num::bigint);
            exception when others then
                null;
            end;
        end if;

        -- Try DD/MM/YYYY format (with slashes)
        begin
            v_date := to_date(trim(p_text), 'DD/MM/YYYY');
            return v_date;
        exception when others then
            null;
        end;

        -- Try MM/DD/YYYY format (with slashes)
        begin
            v_date := to_date(trim(p_text), 'MM/DD/YYYY');
            return v_date;
        exception when others then
            null;
        end;

        -- Try DD-MM-YYYY format (with dashes, day-first)
        -- PostgreSQL's to_date matches non-format characters literally, so
        -- the dash separators in the format mask match the dashes in the input.
        begin
            v_date := to_date(trim(p_text), 'DD-MM-YYYY');
            return v_date;
        exception when others then
            null;
        end;

        -- Try MM-DD-YYYY format (with dashes, month-first)
        begin
            v_date := to_date(trim(p_text), 'MM-DD-YYYY');
            return v_date;
        exception when others then
            null;
        end;

        -- Try DD.MM.YYYY format (with dots, day-first)
        begin
            v_date := to_date(trim(p_text), 'DD.MM.YYYY');
            return v_date;
        exception when others then
            null;
        end;

        return null;
    end;
    $$;


    -- ── 2. Fix refresh_client_360_snapshot to include all boards with any mapping ───
    -- (Previously only boards with a "client" column mapping were included,
    --  excluding boards that only have a Date column — e.g. the "Trial" board.)

    create or replace function public.refresh_client_360_snapshot()
    returns table(rows_upserted bigint)
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
        v_rows bigint;
        v_boards_processed int;
    begin
        -- 1. Refresh auto-detected field mappings (manual overrides preserved)
        perform public.upsert_client_360_field_mappings();

        -- 2. Seed client aliases from existing cell data
        perform public.seed_client_360_client_aliases();

        -- 3. Log board count processed
        select count(distinct r.board_id) into v_boards_processed
        from public.records r
        inner join public.boards b on b.id = r.board_id
        where r.status = 'active';
        raise notice '[Client 360 Snapshot] Processing % boards for organization', v_boards_processed;

        -- 4. Auto-populate status mappings from observed cell values
        insert into public.client_360_status_mappings
            (organization_id, board_id, raw_status_value, is_pending, source, created_at, updated_at)
        select
            fm.organization_id,
            fm.board_id,
            public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text) as raw_status_value,
            CASE
                WHEN lower(public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text)) ~* '(done|complete|completed|delivered|closed|cancelled)' THEN false
                ELSE true
            END as is_pending,
            'auto_detected' as source,
            now(),
            now()
        from public.client_360_field_mappings fm
        join public.cell_values cv
            on cv.board_id = fm.board_id
            and cv.column_id = fm.resolved_column_ref
        where fm.field_type = 'status'
        and cv.value is not null
        on conflict (organization_id, board_id, raw_status_value) do update
            set is_pending = excluded.is_pending,
                updated_at = now();

        -- 5. Upsert the snapshot
        --
        -- Now includes ALL active records from ALL boards, not just those with
        -- a client column mapping. Records from boards without a client column
        -- get client_id = NULL but still contribute to total_jobs and boards_touched.
        with best_mappings as (
            select distinct on (board_id, field_type)
                board_id,
                organization_id,
                field_type,
                resolved_column_ref
            from public.client_360_field_mappings
            order by board_id, field_type,
                case when source = 'manual_override' then 0 else 1 end,
                confidence desc nulls last
        ),
        client_mapping as (
            select board_id, resolved_column_ref
            from best_mappings
            where field_type = 'client'
        ),
        date_mapping as (
            select board_id, resolved_column_ref
            from best_mappings
            where field_type = 'job_date'
        ),
        due_date_mapping as (
            select board_id, resolved_column_ref
            from best_mappings
            where field_type = 'due_date'
        ),
        volume_mapping as (
            select board_id, resolved_column_ref
            from best_mappings
            where field_type = 'volume'
        ),
        status_mapping as (
            select board_id, resolved_column_ref
            from best_mappings
            where field_type = 'status'
        )
        insert into public.client_360_daily_snapshot
            (organization_id, workspace_id, board_id, record_id, job_date, due_date, client_id, volume, status, is_pending, created_at)
        select
            r.organization_id,
            r.workspace_id,
            r.board_id,
            r.id,
            -- job_date: parse the date cell value; NULL if missing or unparseable
            public._client_360_parse_date(
                public._client_360_cell_to_text(
                    dm.resolved_column_ref,
                    cv_date.value,
                    cv_date.value_text
                )
            ),
            -- due_date
            public._client_360_parse_date(
                public._client_360_cell_to_text(
                    dim.resolved_column_ref,
                    cv_due.value,
                    cv_due.value_text
                )
            ),
            -- client_id: resolve the raw client string to a canonical alias (NULL if no client column)
            (
                select ca.client_id
                from public.client_360_client_aliases ca
                where ca.organization_id = r.organization_id
                and public._client_360_normalize_name(ca.alias_text)
                    = public._client_360_normalize_name(
                        public._client_360_cell_to_text(
                            cm.resolved_column_ref,
                            cv_client.value,
                            cv_client.value_text
                        )
                    )
                limit 1
            ),
            -- volume: default 1 when no volume column or empty value
            coalesce(
                public._client_360_parse_volume(
                    public._client_360_cell_to_text(
                        vm.resolved_column_ref,
                        cv_volume.value,
                        cv_volume.value_text
                    )
                ),
                1
            ),
            -- status
            public._client_360_cell_to_text(
                sm.resolved_column_ref,
                cv_status.value,
                cv_status.value_text
            ),
            -- is_pending
            csm.is_pending,
            now()
        from public.records r
        left join public.boards b
            on b.id = r.board_id
        left join client_mapping cm
            on cm.board_id = r.board_id
        left join public.cell_values cv_client
            on cv_client.board_id = r.board_id
            and cv_client.record_id = r.id
            and cv_client.column_id = cm.resolved_column_ref
        left join date_mapping dm
            on dm.board_id = r.board_id
        left join public.cell_values cv_date
            on cv_date.board_id = r.board_id
            and cv_date.record_id = r.id
            and cv_date.column_id = dm.resolved_column_ref
        left join due_date_mapping dim
            on dim.board_id = r.board_id
        left join public.cell_values cv_due
            on cv_due.board_id = r.board_id
            and cv_due.record_id = r.id
            and cv_due.column_id = dim.resolved_column_ref
        left join volume_mapping vm
            on vm.board_id = r.board_id
        left join public.cell_values cv_volume
            on cv_volume.board_id = r.board_id
            and cv_volume.record_id = r.id
            and cv_volume.column_id = vm.resolved_column_ref
        left join status_mapping sm
            on sm.board_id = r.board_id
        left join public.cell_values cv_status
            on cv_status.board_id = r.board_id
            and cv_status.record_id = r.id
            and cv_status.column_id = sm.resolved_column_ref
        left join public.client_360_status_mappings csm
            on csm.board_id = r.board_id
            and csm.raw_status_value = public._client_360_cell_to_text(
                cv_status.column_id, cv_status.value, cv_status.value_text
            )
        where r.status = 'active'
        on conflict (record_id) do update
            set job_date    = excluded.job_date,
                due_date    = excluded.due_date,
                client_id   = excluded.client_id,
                volume      = excluded.volume,
                status      = excluded.status,
                is_pending  = excluded.is_pending,
                created_at  = excluded.created_at;

        get diagnostics v_rows = row_count;
        return query select v_rows;
    end;
    $$;


    -- ── 3. Add a lightweight refresh trigger ───────────────────────────────────────
    -- Marks a "refresh needed" flag on INSERT/UPDATE of records or cell_values.
    -- The daily-activity route handler checks this flag and calls
    -- refresh_client_360_snapshot() when set.

    create table if not exists public.client_360_refresh_state (
        id            boolean primary key default true check (id = true),
        organization_id text,
        last_refresh   timestamptz,
        needs_refresh  boolean not null default true,
        updated_at     timestamptz not null default now()
    );

    create or replace function public._client_360_mark_dirty()
    returns trigger
    language plpgsql
    security definer
    as $$
    begin
        insert into public.client_360_refresh_state (id, organization_id, needs_refresh, updated_at)
        values (true, NULL, true, now())
        on conflict (id) do update
            set needs_refresh = true,
                updated_at = now();
        return null;
    end;
    $$;

    drop trigger if exists client_360_records_dirty on public.records;
    create trigger client_360_records_dirty
        after insert or update on public.records
        for each statement
        execute function public._client_360_mark_dirty();

    drop trigger if exists client_360_cell_values_dirty on public.cell_values;
    create trigger client_360_cell_values_dirty
        after insert or update on public.cell_values
        for each statement
        execute function public._client_360_mark_dirty();

    -- Grants so authenticated/service clients can read/write the refresh state
    grant select, insert, update, delete on public.client_360_refresh_state to anon, authenticated;

    -- ── 4. Initial backfill — re-run snapshot with the fixed logic ────────────────

    do $$
    declare
        v_rows bigint;
    begin
        begin
            select public.refresh_client_360_snapshot() into v_rows;
            raise notice '[Client 360 Activity Fix] Refreshed snapshot: % rows upserted', v_rows;
        exception when others then
            raise notice '[Client 360 Activity Fix] Snapshot refresh skipped (may need manual run after core tables exist)';
        end;
    end;
    $$;
