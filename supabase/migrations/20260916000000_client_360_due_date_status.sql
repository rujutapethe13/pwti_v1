-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20260916000000: Client 360 due-date and status detection
--
-- Extends the Client 360 infrastructure from migration
-- 20260909000000_client_360_materialized_tables.sql to also detect
-- "due/delivery date" columns and "status" columns per board, materialize
-- status→pending mappings, and carry due_date/status/is_pending on the
-- daily snapshot.
--
-- New objects:
--   Tables:
--     * client_360_status_mappings — per-board raw status value → pending flag
--
--   Alterations:
--     * client_360_field_mappings.field_type check → add 'due_date','status'
--     * client_360_daily_snapshot → add due_date, status, is_pending columns
--
--   Functions (create or replace):
--     * _client_360_is_due_date_column(label, type)  → boolean
--     * _client_360_is_status_column(label, type)    → boolean
--     * refresh_client_360_snapshot()                → bigint (extended)
--
--   Indexes:
--     * client_360_daily_snapshot(organization_id, is_pending, due_date)
--     * client_360_daily_snapshot(organization_id, is_pending, job_date)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend field_type check constraint on client_360_field_mappings ────────
-- Only run if the table exists (it may not exist if prior migration failed)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'client_360_field_mappings'
    ) THEN
        DECLARE
            v_constraint_name text;
        BEGIN
            SELECT conname INTO v_constraint_name
            FROM pg_constraint
            WHERE conrelid = 'public.client_360_field_mappings'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%field_type%';

            IF v_constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE public.client_360_field_mappings DROP CONSTRAINT %I', v_constraint_name);
            END IF;

            ALTER TABLE public.client_360_field_mappings
                ADD CONSTRAINT client_360_field_mappings_field_type_check
                CHECK (field_type IN ('client', 'job_date', 'volume', 'due_date', 'status'));
        END;
    END IF;
END;
$$;

-- ── 2. New table: client_360_status_mappings ──────────────────────────────────

create table if not exists public.client_360_status_mappings (
    id                text primary key default gen_random_uuid()::text,
    organization_id   text    not null references public.organizations(id) on delete cascade,
    board_id          text    not null references public.boards(id) on delete cascade,
    raw_status_value  text    not null,
    is_pending        boolean not null default true,
    source            text    not null check (source in ('auto_detected', 'manual_override')),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (organization_id, board_id, raw_status_value)
);
comment on table public.client_360_status_mappings is
    'Per-board, per-raw-status-value pending flag. Auto-detected from status column cell values; humans may override is_pending per row.';



-- ── 4. New / replaced SQL helper functions ────────────────────────────────────

-- Due-date column detection (mirrors DUE_DATE_COLUMN_NAME_HINTS in constants.ts)
create or replace function public._client_360_is_due_date_column(
    p_label text,
    p_type  text
) returns boolean
language sql immutable strict
as $$
    select
        p_type in ('date', 'timeline')
        and (
            lower(p_label) like '%due%'
            or lower(p_label) like '%delivery%'
            or lower(p_label) like '%delivered%'
            or lower(p_label) like '%deadline%'
        )
$$;

-- Status column detection (mirrors STATUS_COLUMN_NAME_HINTS in constants.ts)
create or replace function public._client_360_is_status_column(
    p_label text,
    p_type  text
) returns boolean
language sql immutable strict
as $$
    select
        p_type = 'status'
        or lower(p_label) like '%status%'
$$;

-- ── 5. Extend upsert_client_360_field_mappings with due_date + status ─────────

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

    -- Count results
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

-- ── 6. Update refresh_client_360_snapshot() to populate due_date, status, is_pending ──

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

    -- 3. Log board count processed — confirms no 20-board cap
    select count(distinct r.board_id) into v_boards_processed
    from public.records r
    inner join public.boards b on b.id = r.board_id
    where r.status = 'active'
      and b.organization_id in (
          select distinct organization_id from public.client_360_field_mappings
      );
    raise notice '[Client 360 Snapshot] Processing % boards for organization', v_boards_processed;

    -- 4. Auto-populate status mappings from observed cell values
    --    (discovers distinct raw status values per board and computes is_pending)
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

    -- 5. Upsert the snapshot with due_date, status, is_pending
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
    boards_having_client_mapping as (
        select distinct board_id, organization_id
        from best_mappings
        where field_type = 'client'
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
        -- due_date: parse the date cell value; NULL if no due-date column or unparseable
        public._client_360_parse_date(
            public._client_360_cell_to_text(
                dim.resolved_column_ref,
                cv_due.value,
                cv_due.value_text
            )
        ),
        -- client_id: resolve the raw client string to a canonical alias
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
        -- volume: parse the numeric cell value; default 1 if no volume column
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
        -- status: resolved text from status column; NULL if no status column
        public._client_360_cell_to_text(
            sm.resolved_column_ref,
            cv_status.value,
            cv_status.value_text
        ),
        -- is_pending: looked up from status_mappings by matching raw_status_value
        csm.is_pending,
        now()
    from public.records r
    inner join boards_having_client_mapping b
        on b.board_id = r.board_id
        and b.organization_id = r.organization_id
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

-- ── 7. New indexes for pending-work search hot paths ─────────────────────────

create index if not exists client_360_daily_snapshot_org_pending_due_date_idx
    on public.client_360_daily_snapshot (organization_id, is_pending, due_date);

create index if not exists client_360_daily_snapshot_org_pending_job_date_idx
    on public.client_360_daily_snapshot (organization_id, is_pending, job_date);

-- ── 8. Grants ────────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
    on public.client_360_field_mappings,
       public.client_360_clients,
       public.client_360_client_aliases,
       public.client_360_daily_snapshot,
       public.client_360_status_mappings
    to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ── 9. RLS ──────────────────────────────────────────────────────────────────

alter table public.client_360_field_mappings enable row level security;
alter table public.client_360_clients        enable row level security;
alter table public.client_360_client_aliases  enable row level security;
alter table public.client_360_daily_snapshot  enable row level security;
alter table public.client_360_status_mappings enable row level security;

drop policy if exists "client_360_field_mappings_owner_all" on public.client_360_field_mappings;
create policy "client_360_field_mappings_owner_all" on public.client_360_field_mappings
    for all using (auth.uid() is not null);

drop policy if exists "client_360_clients_owner_all" on public.client_360_clients;
create policy "client_360_clients_owner_all" on public.client_360_clients
    for all using (auth.uid() is not null);

drop policy if exists "client_360_client_aliases_owner_all" on public.client_360_client_aliases;
create policy "client_360_client_aliases_owner_all" on public.client_360_client_aliases
    for all using (auth.uid() is not null);

drop policy if exists "client_360_daily_snapshot_owner_all" on public.client_360_daily_snapshot;
create policy "client_360_daily_snapshot_owner_all" on public.client_360_daily_snapshot
    for all using (auth.uid() is not null);

drop policy if exists "client_360_status_mappings_owner_all" on public.client_360_status_mappings;
create policy "client_360_status_mappings_owner_all" on public.client_360_status_mappings
    for all using (auth.uid() is not null);

-- ── 10. Initial backfill — run once on migration ─────────────────────────────

do $$
declare
    v_rows bigint;
begin
    -- Try to run backfill, gracefully skip if tables don't exist
    begin
        perform public.upsert_client_360_field_mappings();
        perform public.seed_client_360_client_aliases();
        select public.refresh_client_360_snapshot() into v_rows;
        raise notice '[Client 360 Backfill] Upserted % rows into client_360_daily_snapshot', v_rows;
    exception when undefined_table then
        raise notice '[Client 360 Backfill] Skipping: tables not yet created';
    end;
end;
$$;

-- ── 11. pg_cron schedule (best-effort — no error if already installed) ────────

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        begin
            perform cron.unschedule('client-360-snapshot-refresh');
        exception when others then
            null;
        end;
        perform cron.schedule(
            'client-360-snapshot-refresh',
            '0 * * * *',
            'select refresh_client_360_snapshot()'
        );
    end if;
exception
    when others then
        null;
end;
$$;
