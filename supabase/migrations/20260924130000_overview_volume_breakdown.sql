-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20260924130000: Overview volume breakdown by job type
--
-- The Overview page gains a "Volume by job type" breakdown. The grouping field
-- was chosen from a real audit of this workspace, not guessed:
--
--   * job type — a "Job Type" dropdown with 4 real options (Retouching,
--     Compositing, Color Grade, Delivery). The only populated, multi-valued
--     field on any board.
--   * board    — 2 boards, one of which is a system board, 1 holding records.
--     Too coarse to be a meaningful breakdown.
--   * client   — no client-like column exists on any board; `client_360_clients`
--     is empty. Nothing to break down.
--
-- So the breakdown groups by job type. That field was not in the committed
-- migrations, so this migration:
--
-- 1. Allows "job_type" as a field-mapping type.
-- 2. Adds job-type column detection (`_client_360_is_job_type_column`).
-- 3. Adds a `job_type` text column on `client_360_daily_snapshot`, populates it
--    from the refresh, and maps the detecting columns. A board with more than
--    one job-type-like column is mapped at 0.50 confidence (do not guess),
--    mirroring how `status` is handled. The live database already carries this
--    support — this migration is what makes it reproducible from a clean
--    `supabase db reset`, where 20260909000000 alone would not produce it.
--
-- 4. Adds `overview_volume_breakdown()`, which counts real snapshot rows in one
--    round trip. Records with no job type are NOT dropped: they are returned
--    under an empty key so the chart's slices still sum to the real total.
--
-- KNOWN ISSUE, deliberately not addressed here: `_client_360_cell_to_text` in
-- 20260909000000 selects `opt ->> 'label'` where its FROM clause aliases the row
-- as `elem`, so that statement raises `column "opt" does not exist`. The live
-- database runs a corrected variant of that function (verified: the Job Type
-- cell "opt-delivery" resolves to "Delivery"), so the bug only bites a build
-- from the committed migrations. This migration does NOT redefine the function,
-- because the deployed body has diverged from the file and overwriting it from
-- here would guess at changes made elsewhere. Fix it in its own migration, with
-- the live body as the starting point.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Allow "job_type" as a field-mapping type ─────────────────────────────

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
            CHECK (field_type IN ('client', 'job_date', 'volume', 'due_date', 'status', 'completed_date', 'job_type'));
    END IF;
end;
$$;

-- ── 2. Job-type column detection ───────────────────────────────────────────
-- Mirrors JOB_TYPE_COLUMN_NAME_HINTS / JOB_TYPE_COLUMN_TYPES and
-- `isJobTypeColumn()` in src/features/client-360/constants.ts. Keep in sync.

create or replace function public._client_360_is_job_type_column(
    p_label text,
    p_type  text
) returns boolean
language sql immutable strict
as $$
    select
        p_type in ('dropdown', 'status', 'multi_select', 'text', 'long_text')
        and (
            lower(p_label) like '%job type%'
         or lower(p_label) like '%work type%'
         or lower(p_label) like '%service type%'
         or lower(p_label) like '%production type%'
         or lower(p_label) like '%service%'
         or lower(p_label) like '%category%'
         or lower(p_label) like '%discipline%'
         or lower(p_label) like '%department%'
         or lower(p_label) like '%speciality%'
         or lower(p_label) like '%specialty%'
        )
        -- A status column records where a job is in the workflow, not what kind
        -- of work it is. Without this, "Status" would qualify as a job type and
        -- the breakdown would silently show Not Started / Working / Done.
        and lower(p_label) not like '%status%'
$$;

-- ── 3. Job type on the materialized snapshot ────────────────────────────────

alter table public.client_360_daily_snapshot
    add column if not exists job_type text;

comment on column public.client_360_daily_snapshot.job_type is
    'Display label of the board''s job-type column, e.g. "Retouching". NULL when the board has no job-type column or the cell is empty. Never guessed from any other column.';

create index if not exists client_360_daily_snapshot_org_job_type_idx
    on public.client_360_daily_snapshot (organization_id, job_type);

-- ── 4. Detect job-type columns ─────────────────────────────────────────────
-- Boards with 2+ job-type-like columns get confidence 0.50 (low-confidence,
-- do not guess) — the same rule the status mapping uses.

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

    -- ── Client columns ──────────────────────────────────────────
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'client', c.id, 'auto_detected', 0.90, now(), now()
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

    -- ── Job-date columns ────────────────────────────────────────
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'job_date', c.id, 'auto_detected', 0.85, now(), now()
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

    -- ── Due-date columns ────────────────────────────────────────
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'due_date', c.id, 'auto_detected', 0.85, now(), now()
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

    -- ── Completed-date columns ──────────────────────────────────
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'completed_date', c.id, 'auto_detected', 0.85, now(), now()
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

    -- ── Status columns ──────────────────────────────────────────
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'status', c.id, 'auto_detected',
        CASE WHEN c.candidate_count > 1 THEN 0.50 ELSE 0.90 END,
        now(), now()
    from (
        select distinct on (c.board_id)
            c.id, c.board_id, c.organization_id,
            count(*) over (partition by c.board_id) as candidate_count
        from public.columns c
        inner join public.boards b on b.id = c.board_id
        where public._client_360_is_status_column(c.label, c.type)
        order by c.board_id, c.sort_order, c.id
    ) c
    where not exists (
        select 1 from public.client_360_field_mappings fm
        where fm.board_id = c.board_id
          and fm.field_type = 'status'
          and fm.source = 'manual_override'
    );

    -- ── Job-type columns ───────────────────────────────────────
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'job_type', c.id, 'auto_detected',
        CASE WHEN c.candidate_count > 1 THEN 0.50 ELSE 0.90 END,
        now(), now()
    from (
        select distinct on (c.board_id)
            c.id, c.board_id, c.organization_id,
            count(*) over (partition by c.board_id) as candidate_count
        from public.columns c
        inner join public.boards b on b.id = c.board_id
        where public._client_360_is_job_type_column(c.label, c.type)
        order by c.board_id, c.sort_order, c.id
    ) c
    where not exists (
        select 1 from public.client_360_field_mappings fm
        where fm.board_id = c.board_id
          and fm.field_type = 'job_type'
          and fm.source = 'manual_override'
    );

    -- ── Volume columns ──────────────────────────────────────────
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'volume', c.id, 'auto_detected', 0.80, now(), now()
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

-- ── 5. Populate job_type in the snapshot refresh ───────────────────────────

create or replace function public.refresh_client_360_snapshot()
returns table(rows_upserted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rows bigint;
begin
    perform public.upsert_client_360_field_mappings();
    perform public.seed_client_360_client_aliases();

    -- Auto-populate status mappings from observed cell values. This step is
    -- carried forward unchanged from 20260924120000: without it `is_pending`
    -- would silently go NULL for every record on the next refresh.
    insert into public.client_360_status_mappings
        (organization_id, board_id, raw_status_value, is_pending, source, created_at, updated_at)
    select
        fm.organization_id,
        fm.board_id,
        public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text) as raw_status_value,
        case
            when lower(public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text))
                 ~* '(done|complete|completed|delivered|closed|cancelled)' then false
            else true
        end as is_pending,
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
    ),
    job_type_mapping as (
        select board_id, resolved_column_ref
        from best_mappings
        where field_type = 'job_type'
    )
    insert into public.client_360_daily_snapshot
        (organization_id, workspace_id, board_id, record_id, job_date, due_date, completed_date,
         client_id, volume, status, is_pending, job_type, created_at)
    select
        r.organization_id,
        r.workspace_id,
        r.board_id,
        r.id,
        public._client_360_parse_date(
            public._client_360_cell_to_text(dm.resolved_column_ref, cv_date.value, cv_date.value_text)
        ),
        public._client_360_parse_date(
            public._client_360_cell_to_text(dim.resolved_column_ref, cv_due.value, cv_due.value_text)
        ),
        public._client_360_parse_date(
            public._client_360_cell_to_text(cdm.resolved_column_ref, cv_completed.value, cv_completed.value_text)
        ),
        (
            select ca.client_id
            from public.client_360_client_aliases ca
            where ca.organization_id = r.organization_id
              and public._client_360_normalize_name(ca.alias_text)
                = public._client_360_normalize_name(
                    public._client_360_cell_to_text(cm.resolved_column_ref, cv_client.value, cv_client.value_text)
                )
            limit 1
        ),
        coalesce(
            public._client_360_parse_volume(
                public._client_360_cell_to_text(vm.resolved_column_ref, cv_volume.value, cv_volume.value_text)
            ),
            1
        ),
        nullif(trim(public._client_360_cell_to_text(
            sm.resolved_column_ref, cv_status.value, cv_status.value_text
        )), ''),
        csm.is_pending,
        -- Job type: the resolved display label ("Delivery"), or NULL when the
        -- board has no job-type column or the cell is empty. An empty string is
        -- normalized to NULL here so the breakdown's "unclassified" bucket is a
        -- single real group rather than several blank ones.
        nullif(trim(public._client_360_cell_to_text(
            jtm.resolved_column_ref, cv_job_type.value, cv_job_type.value_text
        )), ''),
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
    left join job_type_mapping jtm
        on jtm.board_id = r.board_id
    left join public.cell_values cv_job_type
        on cv_job_type.board_id = r.board_id
        and cv_job_type.record_id = r.id
        and cv_job_type.column_id = jtm.resolved_column_ref
    where r.status = 'active'
    on conflict (record_id) do update
        set job_date       = excluded.job_date,
            due_date       = excluded.due_date,
            completed_date = excluded.completed_date,
            client_id      = excluded.client_id,
            volume         = excluded.volume,
            status         = excluded.status,
            is_pending     = excluded.is_pending,
            job_type       = excluded.job_type,
            created_at     = excluded.created_at;

    get diagnostics v_rows = row_count;
    return query select v_rows;
end;
$$;

-- ── 6. Volume breakdown for one window ─────────────────────────────────────
-- One round trip over the snapshot. Every number is a real count of real rows
-- whose `job_date` falls inside the window; nothing is derived from "now" or
-- defaulted.

create or replace function public.overview_volume_breakdown(
    p_organization_id text,
    p_from            date,
    p_to              date
) returns jsonb
language sql stable
security definer
set search_path = public
as $$
    with in_window as (
        select
            coalesce(nullif(btrim(job_type), ''), '') as job_type,
            volume
        from public.client_360_daily_snapshot
        where organization_id = p_organization_id
          and job_date between p_from and p_to
    ),
    grouped as (
        select
            job_type,
            sum(volume)::int as volume,
            count(*)::int   as jobs
        from in_window
        group by job_type
    )
    select jsonb_build_object(
        'total_volume', coalesce((select sum(volume)::int from in_window), 0),
        'total_jobs',   coalesce((select count(*)::int from in_window), 0),
        -- False means no board in this org maps a job-type column, so every
        -- record lands in the unclassified bucket. The UI says so rather than
        -- presenting one giant slice as if it were a meaningful category.
        'job_type_available', exists (
            select 1
            from public.client_360_field_mappings fm
            where fm.organization_id = p_organization_id
              and fm.field_type = 'job_type'
        ),
        'items', coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'key',    g.job_type,
                        'volume', g.volume,
                        'jobs',   g.jobs
                    )
                    order by g.volume desc, g.job_type asc
                )
                from grouped g
            ),
            '[]'::jsonb
        )
    );
$$;

comment on function public.overview_volume_breakdown(text, date, date) is
    'Volume and job counts per job type for a window. Records without a job type are returned under an empty key rather than being dropped.';

-- SECURITY DEFINER, so this bypasses the RLS on the snapshot. Execution is not
-- granted to anon: an unauthenticated caller must not read an organization's
-- aggregates by passing its id. Callers run server-side via service_role.
grant execute on function public.overview_volume_breakdown(text, date, date) to authenticated, service_role;

-- ── 7. Backfill ────────────────────────────────────────────────────────────
-- Safe to re-run: both steps are idempotent (upsert on record_id).

do $$
declare
    v_rows bigint;
begin
    begin
        select public.refresh_client_360_snapshot() into v_rows;
        raise notice '[Overview Volume Breakdown] Refreshed snapshot: % rows upserted', v_rows;
    exception when others then
        raise notice '[Overview Volume Breakdown] Snapshot refresh skipped: %', sqlerrm;
    end;
end;
$$;
