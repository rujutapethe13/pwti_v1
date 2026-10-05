-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20260909000000: Client 360 materialized snapshot infrastructure
--
-- Extends the Client 360 column-inference pattern (see
-- src/features/client-360/constants.ts) from client-only detection to also
-- detect "job date" and "volume" columns per board, and materializes the
-- results into a queryable table.
--
-- New objects:
--   Tables:
--     * client_360_field_mappings  — per-board column resolution overrides
--     * client_360_clients         — canonical client entities
--     * client_360_client_aliases  — raw-string → canonical-client mapping
--     * client_360_daily_snapshot  — materialized, upsertable result table
--
--   SQL functions:
--     * _client_360_is_client_column(label, type, settings)  → boolean
--     * _client_360_is_job_date_column(label, type)          → boolean
--     * _client_360_is_volume_column(label, type)            → boolean
--     * _client_360_normalize_name(text)                     → text
--     * _client_360_cell_to_text(column_id, value, value_text) → text
--     * _client_360_parse_date(text)                         → date
--     * _client_360_parse_volume(text)                       → int
--     * upsert_client_360_field_mappings()                   → table(int, int)
--     * seed_client_360_client_aliases()                     → table(int, int, int)
--     * refresh_client_360_snapshot()                        → bigint
--
-- Scheduling: pg_cron (if available) runs refresh_client_360_snapshot()
-- hourly.  The function is safe to re-run (idempotent upserts).
--
-- PRECEDENCE: requires the core metadata tables (boards, columns, records,
-- cell_values) and their RLS policies to already exist.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Extension (pg_cron) ─────────────────────────────────────────────────
-- pg_cron is optional — if the extension is not available the function still
-- works when called manually or via an Edge Function.
create extension if not exists pg_cron;

-- ── 1. Tables ─────────────────────────────────────────────────────────────

-- 1a. Per-board, per-field-type column resolution.
--     One row per (board_id, field_type).  `source = manual_override` always
--     wins over `source = auto_detected` when both exist; the auto-detection
--     function deletes and re-creates only `auto_detected` rows, leaving
--     manual overrides untouched.
drop table if exists public.client_360_field_mappings cascade;
create table if not exists public.client_360_field_mappings (
    id                text    primary key default gen_random_uuid()::text,
    board_id          text    not null references public.boards(id) on delete cascade,
    organization_id   text    not null references public.organizations(id) on delete cascade,
    field_type        text    not null check (field_type in ('client', 'job_date', 'volume')),
    resolved_column_ref text  not null,  -- → columns.id
    source            text    not null check (source in ('auto_detected', 'manual_override')),
    confidence        real,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (board_id, field_type)
);
comment on table public.client_360_field_mappings is
    'Resolution of which board column maps to each Client 360 field type. Auto-detected rows can be overridden by manual_override rows.';

-- 1b. Canonical client entities.
drop table if exists public.client_360_client_aliases cascade;
drop table if exists public.client_360_clients cascade;
create table if not exists public.client_360_clients (
    id                text primary key default gen_random_uuid()::text,
    organization_id   text    not null references public.organizations(id) on delete cascade,
    canonical_name    text    not null,
    needs_confirmation boolean not null default false,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (organization_id, canonical_name)
);
comment on table public.client_360_clients is
    'Canonical client entities. When multiple raw variants normalize to the same name they are grouped here and flagged for manual confirmation.';

-- 1c. Raw-string → canonical-client alias mapping.
create table if not exists public.client_360_client_aliases (
    id              text primary key default gen_random_uuid()::text,
    client_id       text    not null references public.client_360_clients(id) on delete cascade,
    organization_id text    not null references public.organizations(id) on delete cascade,
    alias_text      text    not null,
    created_at      timestamptz not null default now(),
    unique (organization_id, alias_text)
);
comment on table public.client_360_client_aliases is
    'Every distinct raw client string (from cell values) maps to a canonical client.';

-- 1d. Materialized daily snapshot — the queryable result table.
--     Upsert key is record_id: re-running the refresh never duplicates rows.
drop table if exists public.client_360_daily_snapshot cascade;
create table if not exists public.client_360_daily_snapshot (
    id              text primary key default gen_random_uuid()::text,
    organization_id text    not null references public.organizations(id) on delete cascade,
    workspace_id    text    not null references public.workspaces(id) on delete cascade,
    board_id        text    not null references public.boards(id) on delete cascade,
    record_id       text    not null references public.records(id) on delete cascade,
    job_date        date,
    due_date        date,
    client_id       text    references public.client_360_clients(id) on delete set null,
    volume          int     not null default 1,
    status          text,
    is_pending      boolean,
    created_at      timestamptz not null default now(),
    unique (record_id)
);
comment on table public.client_360_daily_snapshot is
    'Materialized, queryable Client 360 snapshot. Refreshed by refresh_client_360_snapshot().';

-- Indexes for efficient querying
create index if not exists client_360_daily_snapshot_board_idx
    on public.client_360_daily_snapshot (board_id);
create index if not exists client_360_daily_snapshot_client_idx
    on public.client_360_daily_snapshot (client_id);
create index if not exists client_360_daily_snapshot_job_date_idx
    on public.client_360_daily_snapshot (job_date desc);
create index if not exists client_360_daily_snapshot_org_idx
    on public.client_360_daily_snapshot (organization_id);

create index if not exists client_360_field_mappings_board_type_idx
    on public.client_360_field_mappings (board_id, field_type);
create index if not exists client_360_field_mappings_column_idx
    on public.client_360_field_mappings (resolved_column_ref);

create index if not exists client_360_client_aliases_org_idx
    on public.client_360_client_aliases (organization_id);
create index if not exists client_360_clients_org_idx
    on public.client_360_clients (organization_id);

-- ── 2. Column classification helper functions ─────────────────────────────
-- These mirror the TypeScript hint-matching in src/features/client-360/constants.ts
-- so that auto-detection in the database stays consistent with the UI layer.

create or replace function public._client_360_is_client_column(
    p_label   text,
    p_type    text,
    p_settings jsonb
) returns boolean
language sql immutable strict
as $$
    select
        (
            -- label hint + type must both match (same as CLIENT_COLUMN_NAME_HINTS)
            (
                lower(p_label) like '%client%'
                or lower(p_label) like '%customer%'
                or lower(p_label) like '%account%'
                or lower(p_label) like '%company%'
            )
            and p_type in ('text', 'dropdown', 'status', 'person', 'long_text',
                           'email', 'phone', 'url', 'multi_select')
        )
        or (p_settings ? 'clientType')  -- explicit settings override
$$;

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

create or replace function public._client_360_is_volume_column(
    p_label text,
    p_type  text
) returns boolean
language sql immutable strict
as $$
    select
        p_type in ('number', 'currency')
        and (
            lower(p_label) like '%images%'
            or lower(p_label) like '%sku%'
            or lower(p_label) like '%quantity%'
            or lower(p_label) like '%no. of%'
            or lower(p_label) like '%count%'
        )
$$;

-- ── 3. Cell-value → text extraction ────────────────────────────────────────
-- Mirrors the TypeScript cellToText / resolveOptionLabel logic from
-- src/features/client-360/search-service.ts so that option IDs stored in
-- cell_values.value are resolved to their display labels.

create or replace function public._client_360_normalize_name(p_name text)
returns text
language sql strict
as $$
    select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create or replace function public._client_360_cell_to_text(
    p_column_id   text,
    p_value       jsonb,
    p_value_text  text
) returns text
language plpgsql
stable
as $$
declare
    v_col_type   text;
    v_settings   jsonb;
    v_raw_value  text;
    v_resolved   text;
begin
    ------------------------------------------------------------------
    -- 1. If there's no jsonb value, fall back to value_text
    ------------------------------------------------------------------
    if p_value is null then
        return coalesce(p_value_text, '');
    end if;

    ------------------------------------------------------------------
    -- 2. Look up column type and settings
    ------------------------------------------------------------------
    select type, settings into v_col_type, v_settings
    from public.columns
    where id = p_column_id;

    ------------------------------------------------------------------
    -- 3. Extract raw text based on jsonb type and column type
    ------------------------------------------------------------------
    case jsonb_typeof(p_value)
        when 'string'  then v_raw_value := trim(both '"' from p_value::text);
        when 'number'  then v_raw_value := p_value::text;
        when 'boolean' then v_raw_value := p_value::text;
        when 'object'  then
            -- Timeline columns store {start: "...", end: "..."} — use start
            if v_col_type = 'timeline' then
                v_raw_value := p_value ->> 'start';
            end if;
            -- Otherwise try common display fields
            if v_raw_value is null then
                v_raw_value := coalesce(
                    p_value ->> 'label',
                    p_value ->> 'name',
                    p_value ->> 'text',
                    p_value ->> 'title',
                    p_value ->> 'value'
                );
            end if;
            if v_raw_value is null then
                v_raw_value := p_value::text;
            end if;
        when 'array'   then
            v_raw_value := (
                select string_agg(
                    case
                        when jsonb_typeof(elem) = 'object' then
                            coalesce(elem ->> 'label', elem ->> 'name', elem ->> 'text', elem::text)
                        when jsonb_typeof(elem) = 'string' then
                            trim(both '"' from elem::text)
                        else elem::text
                    end, ', '
                )
                from jsonb_array_elements(p_value) elem
            );
            if v_raw_value is null then
                v_raw_value := '';
            end if;
        else
            v_raw_value := p_value::text;
    end case;

    ------------------------------------------------------------------
    -- 4. Option-type columns: resolve option ID to label via settings.options
    ------------------------------------------------------------------
    if v_col_type in ('status', 'priority', 'dropdown', 'multi_select')
       and v_settings is not null
       and v_settings ? 'options'
       and v_raw_value is not null
       and length(v_raw_value) > 0 then

        select opt ->> 'label'
        into v_resolved
        from jsonb_array_elements(v_settings -> 'options') elem
        where (elem ? 'id'   and elem ->> 'id'   = v_raw_value)
           or (elem ? 'value' and elem ->> 'value' = v_raw_value)
           or (elem ->> 'label' = v_raw_value and elem ? 'label')
        limit 1;

        if v_resolved is not null and length(v_resolved) > 0 then
            return v_resolved;
        end if;
    end if;

    ------------------------------------------------------------------
    -- 5. Fall back to extracted raw text, then value_text
    ------------------------------------------------------------------
    if v_raw_value is not null and length(v_raw_value) > 0 then
        return v_raw_value;
    end if;

    return coalesce(p_value_text, '');
end;
$$;

-- ── 4. Date and volume parsing ─────────────────────────────────────────────
-- Handles ISO dates (YYYY-MM-DD, YYYY-MM-DDTHH:MM:SSZ) and Excel serial
-- numbers.  Falls back to NULL / DEFAULT_VOLUME respectively.

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

    -- Try direct PostgreSQL date cast (handles ISO 8601 date and timestamp)
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

    -- Try DD/MM/YYYY or MM/DD/YYYY formats
    begin
        v_date := to_date(trim(p_text), 'DD/MM/YYYY');
        return v_date;
    exception when others then
        null;
    end;

    begin
        v_date := to_date(trim(p_text), 'MM/DD/YYYY');
        return v_date;
    exception when others then
        null;
    end;

    return null;
end;
$$;

create or replace function public._client_360_parse_volume(p_text text)
returns int
language plpgsql
strict
as $$
declare
    v_clean text;
    v_num   numeric;
begin
    if p_text is null or trim(p_text) = '' then
        return 1;
    end if;

    -- Strip everything that isn't a digit, dot, or minus sign
    v_clean := regexp_replace(trim(p_text), '[^0-9.\-]', '', 'g');
    if v_clean = '' or v_clean = '-' or v_clean = '.' then
        return 1;
    end if;

    begin
        v_num := v_clean::numeric;
        return v_num::int;
    exception when others then
        return 1;
    end;
end;
$$;

-- ── 5. Auto-detect field mappings ─────────────────────────────────────────
-- For every board that has at least one matching column for a field type,
-- insert (or refresh) an `auto_detected` row in client_360_field_mappings.
-- Existing `manual_override` rows are never touched.
-- Fully idempotent: old auto_detected rows are deleted before new ones are
-- inserted, so re-running produces the same result.

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

    -- ── Client columns ──────────────────────────────────────────────
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

    -- ── Job-date columns ────────────────────────────────────────────
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

    -- ── Volume columns ──────────────────────────────────────────────
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

-- ── 6. Seed canonical clients + aliases from distinct cell values ─────────
-- Groups distinct client-like cell values per organization by their
-- normalized form (lowercase, whitespace-collapsed).  When a normalized
-- form has multiple original variants they are grouped under one canonical
-- client and `needs_confirmation` is set to true — they are NOT auto-merged
-- without a human review flag.
-- Idempotent: re-running only fills in newly discovered values.

create or replace function public.seed_client_360_client_aliases()
returns table(clients_created int, aliases_created int, needs_confirmation int)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clients_created     int;
    v_aliases_created     int;
    v_needs_confirmation  int;
begin
    -- Ensure field mappings are current
    perform public.upsert_client_360_field_mappings();

    -- Build the set of distinct (org, normalized, original) values with
    -- variant counts per normalized form.
    drop table if exists _c360_dupes;
    create temporary table _c360_dupes (
        organization_id  text,
        normalized_name  text,
        original_name    text,
        variant_count    int
    ) on commit drop;

    insert into _c360_dupes (organization_id, normalized_name, original_name, variant_count)
    with client_cols as (
        select fm.organization_id, fm.board_id, fm.resolved_column_ref as column_id
        from public.client_360_field_mappings fm
        where fm.field_type = 'client'
    ),
    raw_values as (
        select
            cc.organization_id,
            public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text) as cell_text
        from client_cols cc
        join public.cell_values cv
          on cv.board_id = cc.board_id
         and cv.column_id = cc.column_id
        where cv.value is not null
    ),
    distinct_values as (
        select distinct
            organization_id,
            public._client_360_normalize_name(cell_text) as normalized_name,
            cell_text as original_name
        from raw_values
        where cell_text is not null
          and length(trim(cell_text)) > 0
    ),
    variant_counts as (
        select organization_id, normalized_name, count(*) as variant_count
        from distinct_values
        group by organization_id, normalized_name
    )
    select
        dv.organization_id,
        dv.normalized_name,
        dv.original_name,
        vc.variant_count
    from distinct_values dv
    join variant_counts vc
      on vc.organization_id = dv.organization_id
     and vc.normalized_name = dv.normalized_name;

    ------------------------------------------------------------------
    -- Pass 1: upsert canonical clients
    ------------------------------------------------------------------
    insert into public.client_360_clients (organization_id, canonical_name, needs_confirmation, created_at, updated_at)
    select distinct
        d.organization_id,
        d.normalized_name,
        d.variant_count > 1 as needs_confirmation,
        now(), now()
    from _c360_dupes d
    on conflict (organization_id, canonical_name) do update
        set needs_confirmation = greatest(
            public.client_360_clients.needs_confirmation,
            EXCLUDED.needs_confirmation
        )
        where public.client_360_clients.needs_confirmation = false;

    get diagnostics v_clients_created = row_count;

    ------------------------------------------------------------------
    -- Pass 2: insert aliases
    ------------------------------------------------------------------
    insert into public.client_360_client_aliases (client_id, organization_id, alias_text, created_at)
    select
        c.id,
        d.organization_id,
        d.original_name,
        now()
    from _c360_dupes d
    join public.client_360_clients c
      on c.organization_id = d.organization_id
     and c.canonical_name = d.normalized_name
    on conflict (organization_id, alias_text) do nothing;

    get diagnostics v_aliases_created = row_count;

    ------------------------------------------------------------------
    -- Count clients needing confirmation
    ------------------------------------------------------------------
    select count(*) into v_needs_confirmation
    from public.client_360_clients c
    where c.needs_confirmation = true
      and exists (
          select 1 from _c360_dupes d
          where d.organization_id = c.organization_id
            and d.normalized_name = c.canonical_name
            and d.variant_count > 1
      );

    return query select v_clients_created, v_aliases_created, v_needs_confirmation;
end;
$$;

-- ── 7. Main snapshot refresh ────────────────────────────────────────────────
-- Reads records + cell_values + field_mappings + client aliases and upserts
-- into client_360_daily_snapshot (upsert on record_id).
-- Safe to re-run without creating duplicate rows.

create or replace function public.refresh_client_360_snapshot()
returns table(rows_upserted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rows bigint;
begin
    -- 1. Refresh auto-detected field mappings (manual overrides preserved)
    perform public.upsert_client_360_field_mappings();

    -- 2. Seed client aliases from existing cell data
    perform public.seed_client_360_client_aliases();

    -- 3. Upsert the snapshot
    --
    -- For each active record on a board that has a client column mapping,
    -- extract the client name, job date, and volume from the resolved columns.
    -- Resolve the client name to a canonical client_id via aliases.
    -- Default volume to 1 when no volume column exists or the value is empty.

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
    volume_mapping as (
        select board_id, resolved_column_ref
        from best_mappings
        where field_type = 'volume'
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
        -- due_date: NULL (no due-date column in this version)
        null::date,
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
        -- status: NULL (no status column in this version)
        null::text,
        -- is_pending: NULL (no status column in this version)
        null::boolean,
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
    left join volume_mapping vm
        on vm.board_id = r.board_id
    left join public.cell_values cv_volume
        on cv_volume.board_id = r.board_id
        and cv_volume.record_id = r.id
        and cv_volume.column_id = vm.resolved_column_ref
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

-- ── 8. Table privileges (so anon/authenticated roles can access new tables) ─────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
    on public.client_360_field_mappings,
       public.client_360_clients,
       public.client_360_client_aliases,
       public.client_360_daily_snapshot
    to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ── 9. RLS (owner-only — consistent with owner-only-rls.sql) ────────────────────
alter table public.client_360_field_mappings enable row level security;
alter table public.client_360_clients        enable row level security;
alter table public.client_360_client_aliases enable row level security;
alter table public.client_360_daily_snapshot enable row level security;

-- Owner-only (authenticated) access
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

-- ── 10. Initial backfill — run once on migration ────────────────────────────────
-- This populates all tables from existing data.  Safe to re-run: all steps
-- are idempotent (upserts with ON CONFLICT, temporary tables dropped on commit).
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

-- ── 11. pg_cron schedule (best-effort — no error if already installed) ─────────
-- Runs the snapshot refresh every hour.  If pg_cron is not enabled in the
-- Supabase project this is a no-op (the function can still be called manually
-- or via an Edge Function / HTTP trigger).
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        -- Unschedule existing job if it exists (idempotent re-runs)
        begin
            perform cron.unschedule('client-360-snapshot-refresh');
        exception when others then
            null;
        end;
        -- Schedule the refresh to run hourly
        perform cron.schedule(
            'client-360-snapshot-refresh',
            '0 * * * *',
            'select refresh_client_360_snapshot()'
        );
    end if;
exception
    when others then
        -- pg_cron not available — skip silently
        null;
end;
$$;
