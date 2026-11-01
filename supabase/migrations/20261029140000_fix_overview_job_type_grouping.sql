-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20261029140000: Fix Overview "Volume by job type" grouping
--
-- Root cause: every snapshot row read as "Unclassified" because
-- `refresh_client_360_snapshot()` never populated `job_type`. It resolves each
-- row's job-type cell through `_client_360_cell_to_text()`, whose committed
-- body (migration 20260909000000) references `opt ->> 'label'` while the
-- `jsonb_array_elements(v_settings -> 'options')` row alias is `elem`. Every
-- dropdown / status / multi_select cell with a value therefore raised
-- `column "opt" does not exist`; the abort was swallowed by the
-- `exception when others` backfill block, so `job_type` stayed NULL for all
-- 440 rows and the breakdown folded everything into "Unclassified".
--
-- The corrected function body lives in scripts/fix_cell_to_text.sql but was
-- never applied as a migration. This migration:
--
--   1. Re-defines `_client_360_cell_to_text()` with the alias fixed
--      (`elem` instead of `opt`), so option ids stored in cell_values are
--      resolved to their display labels ("Retouching", "Compositing", …).
--   2. Re-defines `refresh_client_360_snapshot()` so it populates `job_type`
--      from each board's resolved job-type column (one row = one job).
--   3. Backfills: runs the refresh so existing snapshot rows get their job type.
--
-- Safe to re-run: both functions are `create or replace` and the refresh is
-- idempotent (upsert on record_id).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix `_client_360_cell_to_text` — alias is `elem`, not `opt` ───────────

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

        -- NOTE: the row alias from jsonb_array_elements is `elem`. Referring
        -- to it as `opt` (the bug fixed here) raised `column "opt" does not
        -- exist` and aborted the whole snapshot refresh.
        select elem ->> 'label'
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

-- ── 2. Re-define the snapshot refresh so `job_type` is populated per row ─────

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

    -- Auto-populate status mappings from observed cell values.
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
        -- Job type: the resolved display label ("Retouching", …), or NULL when
        -- the board has no job-type column or the cell is empty. NULL rows are
        -- reported by `overview_volume_breakdown()` under the "Unclassified"
        -- bucket; they are never folded into a real category.
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

-- ── 3. Backfill existing snapshot rows with their job type ───────────────────

do $$
declare
    v_rows bigint;
begin
    begin
        select public.refresh_client_360_snapshot() into v_rows;
        raise notice '[Overview Job Type Grouping] Refreshed snapshot: % rows upserted', v_rows;
    exception when others then
        raise notice '[Overview Job Type Grouping] Snapshot refresh skipped: %', sqlerrm;
    end;
end;
$$;

-- ── 4. `overview_volume_breakdown` already groups by `job_type` at record
--     grain with the board filter (migration 20261029130000); no change needed.
--     The totals (volume = jobs = row count) and the board multi-select filter
--     are intentionally untouched.
-- ─────────────────────────────────────────────────────────────────────────────
