    -- ─────────────────────────────────────────────────────────────────────────────
    -- Migration 20260924120000: Overview stat cards with real period aggregates
    --
    -- The Overview stat cards previously had no completion timestamp to measure
    -- against: `client_360_daily_snapshot` carried only `job_date` (received) and
    -- a derived `is_pending` flag, so "avg. turnaround" had to be approximated
    -- against the current date — a number that was not a turnaround at all.
    --
    -- This migration:
    --
    -- 1. Adds `client_360_daily_snapshot.completed_date`, populated from a board
    --    date column that unambiguously records when work actually finished
    --    (Completed / Completion / Finished / Closed date). Planned dates (due,
    --    delivery, deadline, expected, estimated, target) are explicitly excluded
    --    so `due_date` keeps its meaning and the two columns never collide.
    --    Boards without such a column simply get `completed_date = NULL` — nothing
    --    is guessed.
    --
    -- 2. Adds a `completed_date` field type to the auto-detected column mappings
    --    (manual overrides are still preserved).
    --
    -- 3. Adds `overview_period_stats()`, which aggregates one window of the
    --    snapshot in a single database round trip. The caller passes the selected
    --    window AND the immediately preceding window of equal length, so every
    --    trend comparison is a real query against real prior-period rows.
    -- ─────────────────────────────────────────────────────────────────────────────

    -- ── 1. completed_date on the materialized snapshot ──────────────────────────

    alter table public.client_360_daily_snapshot
        add column if not exists completed_date date;

    comment on column public.client_360_daily_snapshot.completed_date is
        'Actual completion date parsed from a board completion-date column. NULL when the board has no such column — never inferred from due_date or from "now".';

    create index if not exists client_360_daily_snapshot_org_completed_date_idx
        on public.client_360_daily_snapshot (organization_id, completed_date desc);

    -- ── 2. Allow "completed_date" as a field mapping type ───────────────────────

    do $$
    declare
        v_constraint_name text;
    begin
        if exists (
            select 1
            from pg_constraint
            where conrelid = 'public.client_360_field_mappings'::regclass
              and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%field_type%'
        ) then
            select conname into v_constraint_name
            from pg_constraint
            where conrelid = 'public.client_360_field_mappings'::regclass
              and contype = 'c'
              and pg_get_constraintdef(oid) ILIKE '%field_type%';

            EXECUTE format('ALTER TABLE public.client_360_field_mappings DROP CONSTRAINT %I', v_constraint_name);

            ALTER TABLE public.client_360_field_mappings
                ADD CONSTRAINT client_360_field_mappings_field_type_check
                CHECK (field_type IN ('client', 'job_date', 'volume', 'due_date', 'status', 'completed_date'));
        END IF;
    END;
    $$;

    -- Job-date (received) detection, with completion labels carved out.
    -- Without these exclusions a column like "Completion Date" would satisfy both
    -- the job-date and the completed-date rule, and the same cell would be counted
    -- as both the received date and the completion date — making turnaround
    -- identically zero. Mirrored in JOB_DATE_COLUMN_NAME_EXCLUDES (constants.ts).
    create or replace function public._client_360_is_job_date_column(
        p_label text,
        p_type  text
    ) returns boolean
    language sql immutable strict
    as $$
        select
            p_type in ('date', 'timeline')
            and (
                -- must NOT contain an exclusion keyword (due, delivery, etc.)
                lower(p_label) not like '%due%'
                and lower(p_label) not like '%delivery%'
                and lower(p_label) not like '%delivered%'
                and lower(p_label) not like '%deadline%'
                and lower(p_label) not like '%upload%'
                and lower(p_label) not like '%estimated%'
                -- must NOT be an actual-completion column
                and lower(p_label) not like '%completed%'
                and lower(p_label) not like '%complete date%'
                and lower(p_label) not like '%completion%'
                and lower(p_label) not like '%finished%'
                and lower(p_label) not like '%closure%'
                and lower(p_label) not like '%closed%'
                and (
                    -- positive hint (priority) OR generic 'date' label (fallback)
                    lower(p_label) like '%received%'
                    or lower(p_label) like '%inward%'
                    or lower(p_label) like '%job date%'
                    or lower(p_label) like '%created%'
                    or lower(p_label) like '%date%'
                )
            )
    $$;

    -- Completion-date column detection.
    -- Mirrors COMPLETED_DATE_COLUMN_NAME_HINTS / COMPLETED_DATE_COLUMN_NAME_EXCLUDES
    -- in src/features/client-360/constants.ts. Keep the two in sync.
    create or replace function public._client_360_is_completed_date_column(
        p_label text,
        p_type  text
    ) returns boolean
    language sql immutable strict
    as $$
        select
            p_type in ('date', 'timeline')
            and (
                lower(p_label) like '%completed%'
                or lower(p_label) like '%complete date%'
                or lower(p_label) like '%completion%'
                or lower(p_label) like '%finished%'
                or lower(p_label) like '%closure%'
                or lower(p_label) like '%closed%'
            )
            -- Never treat a planned or request date as an actual completion.
            and lower(p_label) not like '%due%'
            and lower(p_label) not like '%deadline%'
            and lower(p_label) not like '%delivery%'
            and lower(p_label) not like '%delivered%'
            and lower(p_label) not like '%expected%'
            and lower(p_label) not like '%estimated%'
            and lower(p_label) not like '%target%'
            and lower(p_label) not like '%planned%'
            and lower(p_label) not like '%upload%'
            and lower(p_label) not like '%requested%'
            and lower(p_label) not like '%received%'
            and lower(p_label) not like '%created%'
            and lower(p_label) not like '%reshoot%'
            and lower(p_label) not like '%re-shoot%'
            and lower(p_label) not like '%rework%'
    $$;

    -- ── 3. Detect completion-date columns ──────────────────────────────────────

    create or replace function public.upsert_client_360_field_mappings()
    returns table(mappings_inserted int, mappings_existing int)
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
        v_inserted int;
        v_existing int;
    begin
        -- Remove all previously auto-detected mappings (manual overrides survive)
        delete from public.client_360_field_mappings
        where source = 'auto_detected';

        -- ── Client columns ──────────────────────────────────────
        insert into public.client_360_field_mappings
            (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
        select
            c.board_id,
            c.organization_id,
            'client',
            c.id,
            'auto_detected',
            0.90,
            now(), now()
        from (
            select distinct on (c.board_id)
                c.id, c.board_id, c.organization_id
            from public.columns c
            inner join public.boards b on b.id = c.board_id
            where public._client_360_is_client_column(c.label, c.type, c.settings)
            order by c.board_id, c.sort_order, c.id
        ) c
        where not exists (
            select 1 from public.client_360_field_mappings fm
            where fm.board_id = c.board_id
              and fm.field_type = 'client'
              and fm.source = 'manual_override'
        );

        -- ── Job-date columns ────────────────────────────────────
        insert into public.client_360_field_mappings
            (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
        select
            c.board_id,
            c.organization_id,
            'job_date',
            c.id,
            'auto_detected',
            0.85,
            now(), now()
        from (
            select distinct on (c.board_id)
                c.id, c.board_id, c.organization_id
            from public.columns c
            inner join public.boards b on b.id = c.board_id
            where public._client_360_is_job_date_column(c.label, c.type)
            order by c.board_id, c.sort_order, c.id
        ) c
        where not exists (
            select 1 from public.client_360_field_mappings fm
            where fm.board_id = c.board_id
              and fm.field_type = 'job_date'
              and fm.source = 'manual_override'
        );

        -- ── Due-date columns ────────────────────────────────────
        insert into public.client_360_field_mappings
            (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
        select
            c.board_id,
            c.organization_id,
            'due_date',
            c.id,
            'auto_detected',
            0.85,
            now(), now()
        from (
            select distinct on (c.board_id)
                c.id, c.board_id, c.organization_id
            from public.columns c
            inner join public.boards b on b.id = c.board_id
            where public._client_360_is_due_date_column(c.label, c.type)
            order by c.board_id, c.sort_order, c.id
        ) c
        where not exists (
            select 1 from public.client_360_field_mappings fm
            where fm.board_id = c.board_id
              and fm.field_type = 'due_date'
              and fm.source = 'manual_override'
        );

        -- ── Completed-date columns ──────────────────────────────
        insert into public.client_360_field_mappings
            (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
        select
            c.board_id,
            c.organization_id,
            'completed_date',
            c.id,
            'auto_detected',
            0.85,
            now(), now()
        from (
            select distinct on (c.board_id)
                c.id, c.board_id, c.organization_id
            from public.columns c
            inner join public.boards b on b.id = c.board_id
            where public._client_360_is_completed_date_column(c.label, c.type)
            order by c.board_id, c.sort_order, c.id
        ) c
        where not exists (
            select 1 from public.client_360_field_mappings fm
            where fm.board_id = c.board_id
              and fm.field_type = 'completed_date'
              and fm.source = 'manual_override'
        );

        -- ── Status columns ──────────────────────────────────────
        -- Boards with 0 status-like columns get no row (status is null for those records).
        -- Boards with 2+ status-like columns get confidence 0.50 (low-confidence, do not guess).
        insert into public.client_360_field_mappings
            (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
        select
            c.board_id,
            c.organization_id,
            'status',
            c.id,
            'auto_detected',
            CASE WHEN c.board_status_count > 1 THEN 0.50 ELSE 0.90 END,
            now(), now()
        from (
            select
                cc.id, cc.board_id, cc.organization_id,
                bc.board_status_count
            from (
                select distinct on (c.board_id)
                    c.id, c.board_id, c.organization_id
                from public.columns c
                inner join public.boards b on b.id = c.board_id
                where public._client_360_is_status_column(c.label, c.type)
                order by c.board_id, c.sort_order, c.id
            ) cc
            join (
                select board_id, count(*) as board_status_count
                from public.columns c
                inner join public.boards b on b.id = c.board_id
                where public._client_360_is_status_column(c.label, c.type)
                group by board_id
            ) bc on cc.board_id = bc.board_id
        ) c
        where not exists (
            select 1 from public.client_360_field_mappings fm
            where fm.board_id = c.board_id
              and fm.field_type = 'status'
              and fm.source = 'manual_override'
        );

        -- ── Volume columns ──────────────────────────────────────
        insert into public.client_360_field_mappings
            (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
        select
            c.board_id,
            c.organization_id,
            'volume',
            c.id,
            'auto_detected',
            0.80,
            now(), now()
        from (
            select distinct on (c.board_id)
                c.id, c.board_id, c.organization_id
            from public.columns c
            inner join public.boards b on b.id = c.board_id
            where public._client_360_is_volume_column(c.label, c.type)
            order by c.board_id, c.sort_order, c.id
        ) c
        where not exists (
            select 1 from public.client_360_field_mappings fm
            where fm.board_id = c.board_id
              and fm.field_type = 'volume'
              and fm.source = 'manual_override'
        );

        v_inserted := (
            select count(*) from public.client_360_field_mappings
            where source = 'auto_detected'
        );
        v_existing := (
            select count(*) from public.client_360_field_mappings
            where source = 'manual_override'
        );

        return query select v_inserted, v_existing;
    end;
    $$;

    -- ── 4. Populate completed_date in the snapshot refresh ────────────────────

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
        completed_date_mapping as (
            select board_id, resolved_column_ref
            from best_mappings
            where field_type = 'completed_date'
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
            (organization_id, workspace_id, board_id, record_id, job_date, due_date, completed_date,
             client_id, volume, status, is_pending, created_at)
        select
            r.organization_id,
            r.workspace_id,
            r.board_id,
            r.id,
            -- job_date (received): NULL if the board has no job-date column or the
            -- value is unparseable. Never back-filled from records.created_at.
            public._client_360_parse_date(
                public._client_360_cell_to_text(
                    dm.resolved_column_ref,
                    cv_date.value,
                    cv_date.value_text
                )
            ),
            -- due_date (planned): unchanged semantics
            public._client_360_parse_date(
                public._client_360_cell_to_text(
                    dim.resolved_column_ref,
                    cv_due.value,
                    cv_due.value_text
                )
            ),
            -- completed_date (actual): NULL unless the board has a real completion
            -- date column. Never inferred from due_date, status or "now".
            public._client_360_parse_date(
                public._client_360_cell_to_text(
                    cdm.resolved_column_ref,
                    cv_completed.value,
                    cv_completed.value_text
                )
            ),
            -- client_id
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
            public._client_360_cell_to_text(
                sm.resolved_column_ref,
                cv_status.value,
                cv_status.value_text
            ),
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
        left join completed_date_mapping cdm
            on cdm.board_id = r.board_id
        left join public.cell_values cv_completed
            on cv_completed.board_id = r.board_id
            and cv_completed.record_id = r.id
            and cv_completed.column_id = cdm.resolved_column_ref
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
            set job_date       = excluded.job_date,
                due_date       = excluded.due_date,
                completed_date = excluded.completed_date,
                client_id      = excluded.client_id,
                volume         = excluded.volume,
                status         = excluded.status,
                is_pending     = excluded.is_pending,
                created_at     = excluded.created_at;

        get diagnostics v_rows = row_count;
        return query select v_rows;
    end;
    $$;

    -- ── 5. Single-round-trip aggregate for one window ─────────────────────────
    -- Every number the Overview stat cards need for a window, computed in the
    -- database from real rows. Nothing here is derived from "now" or defaulted.

    create or replace function public._client_360_window_stats(
        p_organization_id text,
        p_from            date,
        p_to              date
    ) returns jsonb
    language sql stable
    security definer
    set search_path = public
    as $$
        with received as (
            select *
            from public.client_360_daily_snapshot
            where organization_id = p_organization_id
              and job_date between p_from and p_to
        ),
        completed_in_window as (
            select *
            from public.client_360_daily_snapshot
            where organization_id = p_organization_id
              and completed_date between p_from and p_to
        ),
        turnaround as (
            select
                count(*) as sample,
                avg((completed_date - job_date)::numeric) as avg_days
            from received
            where completed_date is not null
              and job_date is not null
              -- A completion earlier than the receipt is a data error, not a
              -- measurement. Such rows are excluded and the sample size on the
              -- card discloses how many jobs the average is based on.
              and completed_date >= job_date
        ),
        per_client as (
            select client_id, count(*)::int as jobs
            from received
            where client_id is not null
            group by client_id
        ),
        top_client as (
            select client_id, jobs
            from per_client
            order by jobs desc, client_id asc
            limit 1
        )
        select jsonb_build_object(
            'records_in_window',    (select count(*)::int from received),
            'jobs_received',        (select count(*)::int from received),
            'clients_active',       (select count(distinct client_id)::int from received),
            'boards_touched',       (select count(distinct board_id)::int from received),
            'completed_by_status',  (select count(*)::int from received where is_pending = false),
            'jobs_completed',       (select count(*)::int from completed_in_window),
            'received_timestamps',  (select count(*)::int from received where job_date is not null),
            'completed_timestamps', (select count(*)::int from received where completed_date is not null),
            'turnaround_sample',    (select sample::int from turnaround),
            'turnaround_avg_days',  (select round(avg_days, 2)::float8 from turnaround),
            'completed_date_available', exists (
                select 1
                from public.client_360_field_mappings fm
                where fm.organization_id = p_organization_id
                  and fm.field_type = 'completed_date'
            ),
            'busiest_client', (
                select jsonb_build_object(
                    'client_id', top_client.client_id,
                    'count',     top_client.jobs,
                    'name',      (
                        select c.canonical_name
                        from public.client_360_clients c
                        where c.id = top_client.client_id
                    )
                )
                from top_client
            )
        );
    $$;

    -- ── 6. Public entry point: current window + immediately preceding window ──
    -- Both windows are aggregated server-side in one call, so a trend is always a
    -- comparison against equally many real days immediately before the selection.

    create or replace function public.overview_period_stats(
        p_organization_id text,
        p_from            date,
        p_to              date,
        p_prior_from      date,
        p_prior_to        date
    ) returns jsonb
    language sql stable
    security definer
    set search_path = public
    as $$
        with current_window as (
            select public._client_360_window_stats(p_organization_id, p_from, p_to) as stats
        ),
        current_top_client as (
            select (stats -> 'busiest_client' ->> 'client_id')::text as client_id
            from current_window
            where stats -> 'busiest_client' is not null
        )
        select jsonb_build_object(
            'current', (
                select stats from current_window
            ),
            'prior', public._client_360_window_stats(
                p_organization_id, p_prior_from, p_prior_to
            ),
            -- Same client, previous window: lets the busiest-client card report a
            -- real trend for the client it is actually showing.
            'current_top_client_prior_count', (
                select count(*)::int
                from public.client_360_daily_snapshot s
                where s.organization_id = p_organization_id
                  and s.client_id = (select client_id from current_top_client)
                  and s.job_date between p_prior_from and p_prior_to
            )
        );
    $$;

    comment on function public.overview_period_stats(text, date, date, date, date) is
        'Stat-card aggregates for a selected window and the immediately preceding window of equal length. Returns real counts; the caller decides how to present trends.';

    -- These are SECURITY DEFINER, so they bypass the RLS that scopes the
    -- underlying tables. Execution is deliberately not granted to anon: an
    -- unauthenticated caller must not be able to read an organization's
    -- aggregates by passing its id. Callers run server-side via service_role.
    grant execute on function public.overview_period_stats(text, date, date, date, date) to authenticated, service_role;
    grant execute on function public._client_360_window_stats(text, date, date) to authenticated, service_role;

    -- ── 7. Backfill the new column ────────────────────────────────────────────

    do $$
    declare
        v_rows bigint;
    begin
        begin
            select public.refresh_client_360_snapshot() into v_rows;
            raise notice '[Overview Period Stats] Refreshed snapshot: % rows upserted', v_rows;
        exception when others then
            raise notice '[Overview Period Stats] Snapshot refresh skipped: %', sqlerrm;
        end;
    end;
    $$;
