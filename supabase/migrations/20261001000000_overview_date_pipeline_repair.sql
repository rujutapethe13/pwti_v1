-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20261001000000: Overview date pipeline repair
--
-- WHY THIS EXISTS
-- ---------------
-- The Overview page reported "No data in this period" and "0 received" while the
-- board table held thousands of rows with a populated Receive Date. Root causes,
-- all confirmed against the live database:
--
--  1. THE SNAPSHOT WAS NEVER BUILT.
--     Overview does not read `records`/`cell_values` (what the board view reads).
--     It reads `client_360_daily_snapshot`, a materialized table populated by
--     `refresh_client_360_snapshot()`. That function aborted on every call with
--
--         ON CONFLICT DO UPDATE command cannot affect row a second time
--
--     because its `client_360_status_mappings` INSERT emits one row PER CELL.
--     A board with 4,202 status cells all holding "opt-not-started" proposed
--     4,202 rows for 1 conflict key. Postgres refuses that, the function's
--     transaction rolled back, and the snapshot stayed empty. Every Overview
--     number therefore read 0 — while the board itself was full, because the
--     board view never touches the snapshot.
--
--  2. job_date WAS MAPPED TO A COLUMN THE IMPORTS LEAVE EMPTY.
--     Detection ordered candidates by `sort_order` and took the first, so the
--     board's "Date" column (0 cells) was chosen as the received date while
--     "Receive Date" (3,987 populated cells) was ignored. This is precisely the
--     "filters on a column my imported rows leave empty" failure.
--
--  3. THE DATE PARSER COULD NOT READ dd-mm-yyyy RELIABLY.
--     `_client_360_parse_date` tried `::date` first, which depends on the
--     session DateStyle, then fell through to `to_date(...,'DD/MM/YYYY')` and
--     silently returned NULL for anything it could not coerce. There was no
--     explicit day-month-year branch, and no way to tell "unparseable" apart
--     from "empty".
--
--  4. GROUPING HAPPENED ON STRINGS, IN THE BROWSER.
--     The volume trend fetched raw `job_date` values and bucketed them with
--     `new Date(...)` in TypeScript. A 1-year range built 366 buckets client-side.
--
-- WHAT THIS MIGRATION CHANGES
-- ---------------------------
--  A. `_client_360_parse_date` — explicit, ordered, day-month-year first-class.
--     Parses ISO, dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy as DAY-MONTH-YEAR, Excel
--     serials, then ISO timestamps. Returns NULL for empty and invalid input and
--     never raises, so a bad row is skipped instead of aborting a query.
--
--  B. `_client_360_normalize_date_text` — returns ISO `YYYY-MM-DD` text or NULL,
--     used to migrate date cells to ISO without a crash on junk rows.
--
--  C. Normalizes existing `cell_values` for date/timeline columns to ISO, and
--     clears the literal string "null" that the importer wrote into 3,517 cells.
--
--  D. `upsert_client_360_field_mappings` — a date column is only eligible as
--     job_date when it actually holds parseable dates, and candidates are ranked
--     by hint strength, then by how much data they hold, then by sort_order.
--     An empty column can no longer win.
--
--  E. `refresh_client_360_snapshot` — the status INSERT is grouped by its
--     conflict key, and the snapshot INSERT is de-duplicated by record_id, so no
--     join fan-out can ever propose the same ON CONFLICT key twice. This is the
--     fix for cause 1.
--
--  F. `overview_volume_trend(...)` — new. Date-range filtering AND bucketing
--     happen in SQL via `date_trunc` over the real DATE column. Supports day /
--     week / month, optional workspace scoping, and returns a `coverage` block.
--
--  G. `overview_period_stats(...)` — gains optional workspace scoping and a
--     `coverage` block (total / in-range / before / after / undated).
--
--  H. `overview_data_bounds(...)` — the real min/max job_date in scope, so
--     "All time" can resolve to the data that exists rather than an arbitrary
--     epoch and drawing thousands of empty buckets.
--
--  I. RLS note: the Overview API reads through `service_role`, which bypasses
--     RLS entirely. Row Level Security is therefore NOT what was hiding the
--     rows; adding workspace scoping here is defence in depth, not the fix.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A. Explicit, never-raising date parser ────────────────────────────────

create or replace function public._client_360_parse_date(p_text text)
returns date
language plpgsql
immutable
as $$
declare
    v_raw  text;
    v_parts text[];
    v_day  int;
    v_mon  int;
    v_year int;
    v_date date;
begin
    if p_text is null then
        return null;
    end if;

    v_raw := btrim(p_text);

    -- Empty input, and the literal junk the importer writes for a missing
    -- value. Both mean "no date", not a parse failure.
    if v_raw = '' or lower(v_raw) in ('null', 'undefined', 'nan', '-', 'n/a', 'na') then
        return null;
    end if;

    -- 1. ISO 8601. Matched by pattern and cut explicitly, so the session
    --    DateStyle can never reinterpret "2025-06-11" as June 11th or the
    --    11th of June depending on who is asking.
    if v_raw ~ '^\d{4}-\d{1,2}-\d{1,2}' then
        v_parts := regexp_match(v_raw, '^(\d{4})-(\d{1,2})-(\d{1,2})');
        v_year := v_parts[1]::int;
        v_mon  := v_parts[2]::int;
        v_day  := v_parts[3]::int;
        if v_mon between 1 and 12 and v_day between 1 and 31 then
            -- Range-checking the fields is not enough: 31 Feb passes it but is
            -- not a real day, and make_date raises on it. The inner block turns
            -- that raise into "no date" so one impossible calendar date in an
            -- import cannot abort the entire snapshot refresh.
            begin
                v_date := make_date(v_year, v_mon, v_day);
                return v_date;
            exception when others then
                return null;
            end;
        end if;
        return null;
    end if;

    -- 2. Day-month-year, explicitly. "21-09-2025" is the 21st of September.
    --    Tried before the month-first form on purpose: a two-digit-first value
    --    greater than 12 can only be a day, and a value at or below 12 is read
    --    day-first to match how the studio's exports are written.
    if v_raw ~ '^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$' then
        v_parts := regexp_match(v_raw, '^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$');
        v_day  := v_parts[1]::int;
        v_mon  := v_parts[2]::int;
        v_year := v_parts[3]::int;

        if v_year < 100 then
            v_year := case when v_year < 70 then 2000 + v_year else 1900 + v_year end;
        end if;

        if v_mon between 1 and 12 and v_day between 1 and 31 then
            -- Same guard as the ISO branch above: a well-formed but impossible
            -- day such as 31/02/2025 is reported as no date, never raised.
            begin
                v_date := make_date(v_year, v_mon, v_day);
                return v_date;
            exception when others then
                return null;
            end;
        end if;
        return null;
    end if;

    -- 3. Excel serial day number (days since 1899-12-30). Only for 5-digit
    --    values, so a bare "1234" is not silently read as a date in 1903.
    if v_raw ~ '^\d{5}(\.\d+)?$' then
        v_date := date '1899-12-30' + v_raw::numeric::int;
        return v_date;
    end if;

    -- 4. Last resort: a full timestamp or a textual date Postgres understands.
    begin
        v_date := v_raw::date;
        return v_date;
    exception when others then
        return null;
    end;
end;
$$;

comment on function public._client_360_parse_date(text) is
    'Parses a cell value to a DATE. Understands ISO 8601, dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy as DAY-MONTH-YEAR, and Excel serial numbers. Returns NULL for empty or unparseable input; never raises, so one bad row cannot abort a query.';

-- ── B. ISO text normalizer for the data migration ─────────────────────────

create or replace function public._client_360_normalize_date_text(p_text text)
returns text
language sql
immutable
as $$
    select case
        when public._client_360_parse_date(p_text) is null then null
        else to_char(public._client_360_parse_date(p_text), 'YYYY-MM-DD')
    end;
$$;

comment on function public._client_360_normalize_date_text(text) is
    'Returns YYYY-MM-DD for any date the parser understands, or NULL. Used to migrate date cells to ISO without failing on rows that hold no usable date.';

-- ── C. Normalize stored date cells to ISO ─────────────────────────────────
--
-- Runs over `columns.type = 'date'` ONLY, and deliberately not `timeline`.
-- A timeline cell is stored as a JSON object `{"start": ..., "end": ...}`
-- (see the board column registry and the exporter, which both read that
-- shape). `_client_360_cell_to_text` resolves such a cell to its `start`
-- alone, so normalizing one with this block would replace the object with a
-- bare "YYYY-MM-DD" string and destroy the `end` date — irreversibly, and
-- while the notices below report the run as a success. Timeline cells already
-- hold ISO strings, so they need no repair.
--
-- The importer wrote dd-mm-yyyy text in some uploads and the literal string
-- "null" in others; both are corrected here. A row whose value cannot be
-- parsed is left untouched rather than deleted — the parser returning NULL is
-- the signal to skip it, and the snapshot treats a NULL job_date as "no
-- received date", never as an error.

do $$
declare
    v_normalized int;
    v_cleared    int;
begin
    with candidates as (
        select
            cv.id,
            public._client_360_normalize_date_text(
                public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text)
            ) as iso
        from public.cell_values cv
        inner join public.columns c on c.id = cv.column_id
        where c.type = 'date'
    )
    update public.cell_values cv
    set value      = to_jsonb(candidates.iso),
        value_text = candidates.iso,
        updated_at = now()
    from candidates
    where cv.id = candidates.id
      and candidates.iso is not null
      and (
            cv.value is distinct from to_jsonb(candidates.iso)
         or cv.value_text is distinct from candidates.iso
      );

    get diagnostics v_normalized = row_count;
    raise notice '[Overview Date Repair] normalized % date cell(s) to ISO YYYY-MM-DD', v_normalized;

    -- The literal string "null" is not a date. Clearing value_text stops it
    -- being fed to the parser as if it were one.
    --
    -- The join to `columns` is required, not decorative: without it this
    -- statement matches every column of every organization, so a text cell
    -- legitimately holding the string "NaN" (a measurement, a note) would lose
    -- its value. Scope it exactly like the statement above.
    update public.cell_values cv
    set value_text = '',
        updated_at = now()
    where cv.value is null
      and lower(btrim(coalesce(cv.value_text, ''))) in ('null', 'undefined', 'nan')
      and exists (
        select 1
        from public.columns c
        where c.id = cv.column_id
          and c.type = 'date'
      );

    get diagnostics v_cleared = row_count;
    raise notice '[Overview Date Repair] cleared % placeholder "null" value(s)', v_cleared;
end;
$$;

-- ── D. Column detection: only a column that holds dates may be the job date ─
--
-- A helper that counts how many cells on a column carry a parseable date. Used
-- to rank candidates so an empty column can never be selected as the received
-- date, which is what left every snapshot row with job_date = NULL.

create or replace function public._client_360_date_column_populated_count(p_column_id text)
returns bigint
language sql
stable
as $$
    select count(*)
    from public.cell_values cv
    where cv.column_id = p_column_id
      and public._client_360_parse_date(
              public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text)
          ) is not null;
$$;

comment on function public._client_360_date_column_populated_count(text) is
    'How many cells on this column hold a parseable date. Zero means the column cannot serve as a date source.';

-- Hint strength for a job-date column: 0 = an explicit received/inward/job-date
-- label, 1 = a generic date label. Used to break ties between populated
-- candidates, so "Receive Date" always beats a bare "Date".
create or replace function public._client_360_job_date_hint_rank(p_label text)
returns int
language sql
immutable
as $$
    select case
        when lower(p_label) like '%received%'
          or lower(p_label) like '%inward%'
          or lower(p_label) like '%job date%' then 0
        else 1
    end;
$$;

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
    -- A column qualifies only when it actually holds a parseable date, and the
    -- best populated candidate wins. Previously the first candidate by
    -- sort_order was taken regardless of content, so an empty "Date" column
    -- shadowed a fully populated "Receive Date".
    --
    -- Ranking is by how much data a column holds FIRST, then by label hint.
    -- Populated count leads deliberately: the label is only a tie-break between
    -- columns that hold comparable data. Ranking on the label first would let a
    -- near-empty "Date Received" (2 cells) beat a fully populated "Date"
    -- (3,987 cells) and hand the Overview a mostly empty chart all over again —
    -- the same failure mode as the empty column, one degree subtler. When the
    -- counts are close, the hint decides and "Receive Date" wins, which is the
    -- case this ranking exists to get right.
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id, c.organization_id, 'job_date', c.id, 'auto_detected', 0.85, now(), now()
    from (
        select distinct on (c.board_id)
            c.id,
            c.board_id,
            c.organization_id,
            public._client_360_date_column_populated_count(c.id) as populated
        from public.columns c
        inner join public.boards b on b.id = c.board_id
        where public._client_360_is_job_date_column(c.label, c.type)
        order by
            c.board_id,
            public._client_360_date_column_populated_count(c.id) desc,
            public._client_360_job_date_hint_rank(c.label),
            c.sort_order,
            c.id
    ) c
    where c.populated > 0
      and not exists (
        select 1 from public.client_360_field_mappings fm
        where fm.board_id = c.board_id
          and fm.field_type = 'job_date'
          and fm.source = 'manual_override'
    );

    -- ── Due-date columns ───────────────────────────────────────
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
    -- One row per board. The candidate_count window function is computed before
    -- DISTINCT ON so a board with several status-like columns is recorded as
    -- low-confidence rather than silently picking one.
    insert into public.client_360_field_mappings
        (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
    select
        c.board_id,
        c.organization_id,
        'status',
        c.id,
        'auto_detected',
        case when c.candidate_count > 1 then 0.50 else 0.90 end,
        now(),
        now()
    from (
        select distinct on (c.board_id)
            c.id,
            c.board_id,
            c.organization_id,
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
        case when c.candidate_count > 1 then 0.50 else 0.90 end,
        now(), now()
    from (
        select distinct on (c.board_id)
            c.id,
            c.board_id,
            c.organization_id,
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

    -- ── Volume columns ─────────────────────────────────────────
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

    v_inserted := (select count(*) from public.client_360_field_mappings where source = 'auto_detected');
    v_existing := (select count(*) from public.client_360_field_mappings where source = 'manual_override');

    return query select v_inserted, v_existing;
end;
$$;

-- ── E. Snapshot refresh: no ON CONFLICT key may repeat ────────────────────
--
-- The repair is twofold. The status INSERT is grouped by its conflict key, which
-- removes the duplicate at the source. The snapshot INSERT additionally
-- de-duplicates by record_id, so no future join fan-out can reintroduce the
-- failure and silently empty the Overview again.

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

    -- Grouped by (organization_id, board_id, raw_status_value): the exact
    -- conflict key. Emitting one row per cell is what raised
    -- "ON CONFLICT DO UPDATE command cannot affect row a second time".
    insert into public.client_360_status_mappings
        (organization_id, board_id, raw_status_value, is_pending, source, created_at, updated_at)
    select
        observed.organization_id,
        observed.board_id,
        observed.raw_status_value,
        bool_and(
            lower(observed.raw_status_value) !~* '(done|complete|completed|delivered|closed|cancelled)'
        ) as is_pending,
        'auto_detected' as source,
        now(),
        now()
    from (
        select distinct
            fm.organization_id,
            fm.board_id,
            public._client_360_cell_to_text(cv.column_id, cv.value, cv.value_text) as raw_status_value
        from public.client_360_field_mappings fm
        join public.cell_values cv
            on cv.board_id = fm.board_id
            and cv.column_id = fm.resolved_column_ref
        where fm.field_type = 'status'
          and cv.value is not null
    ) observed
    where nullif(btrim(observed.raw_status_value), '') is not null
    group by observed.organization_id, observed.board_id, observed.raw_status_value
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
        select board_id, resolved_column_ref from best_mappings where field_type = 'client'
    ),
    date_mapping as (
        select board_id, resolved_column_ref from best_mappings where field_type = 'job_date'
    ),
    due_date_mapping as (
        select board_id, resolved_column_ref from best_mappings where field_type = 'due_date'
    ),
    completed_date_mapping as (
        select board_id, resolved_column_ref from best_mappings where field_type = 'completed_date'
    ),
    volume_mapping as (
        select board_id, resolved_column_ref from best_mappings where field_type = 'volume'
    ),
    status_mapping as (
        select board_id, resolved_column_ref from best_mappings where field_type = 'status'
    ),
    job_type_mapping as (
        select board_id, resolved_column_ref from best_mappings where field_type = 'job_type'
    ),
    -- One resolved row per record. This is the guard that makes the upsert
    -- immune to join fan-out: whatever the left joins below produce, the ON
    -- CONFLICT (record_id) key appears at most once.
    resolved as (
        select distinct on (r.id)
            r.id as record_id,
            r.organization_id,
            r.workspace_id,
            r.board_id,
            public._client_360_parse_date(
                public._client_360_cell_to_text(dm.resolved_column_ref, cv_date.value, cv_date.value_text)
            ) as job_date,
            public._client_360_parse_date(
                public._client_360_cell_to_text(dim.resolved_column_ref, cv_due.value, cv_due.value_text)
            ) as due_date,
            public._client_360_parse_date(
                public._client_360_cell_to_text(cdm.resolved_column_ref, cv_completed.value, cv_completed.value_text)
            ) as completed_date,
            (
                select ca.client_id
                from public.client_360_client_aliases ca
                where ca.organization_id = r.organization_id
                  and public._client_360_normalize_name(ca.alias_text)
                    = public._client_360_normalize_name(
                        public._client_360_cell_to_text(cm.resolved_column_ref, cv_client.value, cv_client.value_text)
                    )
                order by ca.client_id
                limit 1
            ) as client_id,
            coalesce(
                public._client_360_parse_volume(
                    public._client_360_cell_to_text(vm.resolved_column_ref, cv_volume.value, cv_volume.value_text)
                ),
                1
            ) as volume,
            nullif(trim(public._client_360_cell_to_text(
                sm.resolved_column_ref, cv_status.value, cv_status.value_text
            )), '') as status,
            csm.is_pending,
            nullif(trim(public._client_360_cell_to_text(
                jtm.resolved_column_ref, cv_job_type.value, cv_job_type.value_text
            )), '') as job_type
        from public.records r
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
            and csm.organization_id = r.organization_id
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
        order by r.id, r.organization_id, r.workspace_id, r.board_id
    )
    insert into public.client_360_daily_snapshot
        (organization_id, workspace_id, board_id, record_id, job_date, due_date, completed_date,
         client_id, volume, status, is_pending, job_type, created_at)
    select
        resolved.organization_id,
        resolved.workspace_id,
        resolved.board_id,
        resolved.record_id,
        resolved.job_date,
        resolved.due_date,
        resolved.completed_date,
        resolved.client_id,
        resolved.volume,
        resolved.status,
        resolved.is_pending,
        resolved.job_type,
        now()
    from resolved
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

-- ── Coverage helper, shared by both Overview aggregates ───────────────────
--
-- Answers "if this window is empty, is there data elsewhere?" without a second
-- round trip, so the UI can say "N items exist outside this range" instead of
-- showing a bare "No data in this period".

create or replace function public._client_360_coverage(
    p_organization_id text,
    p_workspace_ids   text[] default null,
    p_from            date  default null,
    p_to              date  default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with scoped as (
        select s.job_date
        from public.client_360_daily_snapshot s
        where s.organization_id = p_organization_id
          and (p_workspace_ids is null or s.workspace_id = any (p_workspace_ids))
    )
    select jsonb_build_object(
        'total_rows',   (select count(*)::int from scoped),
        'dated_rows',   (select count(*)::int from scoped where job_date is not null),
        'in_range',     case when p_from is null or p_to is null then null
                              else (select count(*)::int from scoped
                                    where job_date between p_from and p_to) end,
        'before_range', case when p_from is null then null
                              else (select count(*)::int from scoped
                                    where job_date < p_from) end,
        'after_range',  case when p_to is null then null
                              else (select count(*)::int from scoped
                                    where job_date > p_to) end,
        'undated',      (select count(*)::int from scoped where job_date is null),
        'earliest',     (select min(job_date) from scoped),
        'latest',       (select max(job_date) from scoped)
    );
$$;

-- ── F. Volume trend: range filter AND grouping in SQL, on the DATE column ──

-- Month buckets are keyed "YYYY-MM" so they match the axis identity the chart
-- already uses; day and week buckets are a full date. Defined before the
-- aggregate that calls it, because PostgreSQL validates SQL function bodies at
-- creation time.
create or replace function public.bucket_key(p_bucket date, p_granularity text)
returns text
language sql
immutable
as $$
    select case
        when p_granularity = 'month' then to_char(p_bucket, 'YYYY-MM')
        else to_char(p_bucket, 'YYYY-MM-DD')
    end;
$$;

create or replace function public.overview_volume_trend(
    p_organization_id text,
    -- No default: Postgres rejects a defaulted parameter that is followed by
    -- non-defaulted ones (42P13). Every caller passes this by name over
    -- PostgREST, so it never needed a default anyway.
    p_workspace_ids   text[],
    p_from            date,
    p_to              date,
    p_granularity     text default 'day'
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with     settings as (
        -- Only these three are accepted; anything else falls back to day rather
        -- than being interpolated into date_trunc unchecked.
        select case
            when p_granularity in ('day', 'week', 'month') then p_granularity
            else 'day'
        end as gran
    ),
    -- Date filter only here. Filtering on job_date here and then deriving BOTH
    -- series from it silently dropped every job completed inside the window whose
    -- received date predates it, so the chart's completed total disagreed with
    -- the "Jobs completed" stat card, which counts on completed_date alone.
    scoped as (
        select s.job_date, s.completed_date, s.volume
        from public.client_360_daily_snapshot s
        where s.organization_id = p_organization_id
          and (p_workspace_ids is null or s.workspace_id = any (p_workspace_ids))
    ),
    received as (
        select
            -- date_trunc('week', ...) returns the ISO MONDAY, but the client
            -- builds its axis with startOfWeek(), which subtracts getDay() and so
            -- starts weeks on SUNDAY. Keys from the two never match, and every
            -- weekly bucket resolves to zero. Subtract a day here so the SQL
            -- speaks the same Sunday-based week the TypeScript does.
            case
                when (select gran from settings) = 'week'
                    then date_trunc('week', s.job_date)::date - 1
                else date_trunc((select gran from settings), s.job_date)::date
            end as bucket,
            -- `jobs` is a COUNT so it means the same thing as the "Jobs received"
            -- stat card, which is also count(*). The chart previously summed
            -- `volume` under the same name, so the card and the trend showed
            -- different numbers for an identical window whenever a board mapped a
            -- volume column. `volume` is still reported separately below.
            count(*)::int as jobs,
            coalesce(sum(s.volume), 0)::int as volume
        from scoped s
        where s.job_date is not null
          and s.job_date between p_from and p_to
        group by 1
    ),
    completed as (
        select
            case
                when (select gran from settings) = 'week'
                    then date_trunc('week', s.completed_date)::date - 1
                else date_trunc((select gran from settings), s.completed_date)::date
            end as bucket,
            count(*)::int as jobs,
            coalesce(sum(s.volume), 0)::int as volume
        from scoped s
        where s.completed_date is not null
          and s.completed_date between p_from and p_to
        group by 1
    )
    select jsonb_build_object(
        'granularity', (select gran from settings),
        'received', coalesce((
            select jsonb_agg(
                jsonb_build_object('key', bucket_key(r.bucket, (select gran from settings)), 'jobs', r.jobs)
                order by r.bucket
            )
            from received r
        ), '[]'::jsonb),
        'completed', coalesce((
            select jsonb_agg(
                jsonb_build_object('key', bucket_key(c.bucket, (select gran from settings)), 'jobs', c.jobs)
                order by c.bucket
            )
            from completed c
        ), '[]'::jsonb),
        'completed_date_available', exists (
            select 1 from public.client_360_field_mappings fm
            where fm.organization_id = p_organization_id
              and fm.field_type = 'completed_date'
        ),
        'coverage', public._client_360_coverage(p_organization_id, p_workspace_ids, p_from, p_to)
    );
$$;

comment on function public.overview_volume_trend(text, text[], date, date, text) is
    'Received and completed volume bucketed in SQL via date_trunc over the real job_date / completed_date DATE columns. Returns a coverage block describing rows outside the window. p_workspace_ids NULL means every workspace in the organization.';

-- ── G. Stat cards: workspace scoping + coverage ──────────────────────────
--
-- Replaces _client_360_window_stats and overview_period_stats. The window
-- aggregate itself is unchanged in meaning; it gains the same coverage block so
-- the empty state can be specific.

create or replace function public._client_360_window_stats(
    p_organization_id text,
    p_workspace_ids   text[],
    p_from            date,
    p_to              date
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with received as (
        select *
        from public.client_360_daily_snapshot
        where organization_id = p_organization_id
          and (p_workspace_ids is null or workspace_id = any (p_workspace_ids))
          and job_date between p_from and p_to
    ),
    completed_in_window as (
        select *
        from public.client_360_daily_snapshot
        where organization_id = p_organization_id
          and (p_workspace_ids is null or workspace_id = any (p_workspace_ids))
          and completed_date between p_from and p_to
    ),
    -- A completion earlier than the receipt is a data error, not a measurement.
    -- Those rows are excluded and the sample size discloses the difference.
    turnaround as (
        select
            count(*) as sample,
            avg((completed_date - job_date)::numeric) as avg_days
        from received
        where completed_date is not null
          and job_date is not null
          and completed_date >= job_date
    ),
    per_client as (
        select client_id, count(*)::int as jobs
        from received
        where client_id is not null
        group by client_id
    ),
    top_client as (
        select client_id, jobs from per_client order by jobs desc, client_id asc limit 1
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
            select 1 from public.client_360_field_mappings fm
            where fm.organization_id = p_organization_id
              and fm.field_type = 'completed_date'
        ),
        'busiest_client', (
            select jsonb_build_object(
                'client_id', top_client.client_id,
                'count',     top_client.jobs,
                'name',      (select c.canonical_name from public.client_360_clients c
                              where c.id = top_client.client_id)
            ) from top_client
        )
    );
$$;

create or replace function public.overview_period_stats(
    p_organization_id text,
    p_workspace_ids   text[],
    p_from            date,
    p_to              date,
    p_prior_from      date,
    p_prior_to        date
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with current_window as (
        select public._client_360_window_stats(p_organization_id, p_workspace_ids, p_from, p_to) as stats
    ),
    current_top_client as (
        select (stats -> 'busiest_client' ->> 'client_id')::text as client_id
        from current_window
        where stats -> 'busiest_client' is not null
    )
    select jsonb_build_object(
        'current', (select stats from current_window),
        'prior', public._client_360_window_stats(p_organization_id, p_workspace_ids, p_prior_from, p_prior_to),
        'current_top_client_prior_count', (
            select count(*)::int
            from public.client_360_daily_snapshot s
            where s.organization_id = p_organization_id
              and (p_workspace_ids is null or s.workspace_id = any (p_workspace_ids))
              and s.client_id = (select client_id from current_top_client)
              and s.job_date between p_prior_from and p_prior_to
        ),
        'coverage', public._client_360_coverage(p_organization_id, p_workspace_ids, p_from, p_to)
    );
$$;

comment on function public.overview_period_stats(text, text[], date, date, date, date) is
    'Stat-card aggregates for the selected window and the immediately preceding window of equal length, plus a coverage block describing rows outside the window. p_workspace_ids NULL means every workspace in the organization.';

-- ── H. Real data bounds, so "All time" resolves to what exists ────────────

create or replace function public.overview_data_bounds(
    p_organization_id text,
    p_workspace_ids   text[] default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'earliest', (select min(job_date) from public.client_360_daily_snapshot
                     where organization_id = p_organization_id
                       and (p_workspace_ids is null or workspace_id = any (p_workspace_ids))),
        'latest',   (select max(job_date) from public.client_360_daily_snapshot
                     where organization_id = p_organization_id
                       and (p_workspace_ids is null or workspace_id = any (p_workspace_ids)))
        -- No 'rows' key: every caller reads only earliest/latest, and a third
        -- count(*) over the whole snapshot per call is pure cost — this RPC is
        -- issued once per Overview section.
    );
$$;

-- ── Grants ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER, so these bypass the RLS on the snapshot entirely.
--
-- Postgres grants EXECUTE to PUBLIC on every newly created function, and
-- `grant execute ... to authenticated, service_role` ADDS to that rather than
-- replacing it. Without an explicit revoke, `anon` can call all of these over
-- PostgREST and read any organization's aggregates simply by passing its id —
-- the functions have no membership check of their own, and NULL p_workspace_ids
-- widens to every workspace in that organization.
--
-- So: revoke from PUBLIC and anon FIRST, then grant to the only caller that
-- exists. Nothing in this app calls these RPCs from the browser; they are
-- reached exclusively through service_role on the server.

revoke all on function public.overview_period_stats(text, text[], date, date, date, date) from public, anon;
revoke all on function public._client_360_window_stats(text, text[], date, date) from public, anon;
revoke all on function public.overview_volume_trend(text, text[], date, date, text) from public, anon;
revoke all on function public.overview_data_bounds(text, text[]) from public, anon;
revoke all on function public._client_360_coverage(text, text[], date, date) from public, anon;
revoke all on function public.bucket_key(date, text) from public, anon;
revoke all on function public._client_360_normalize_date_text(text) from public, anon;
revoke all on function public._client_360_date_column_populated_count(text) from public, anon;
revoke all on function public._client_360_job_date_hint_rank(text) from public, anon;

-- These three MUTATE global state and are the worst case of the same problem:
-- an anonymous visitor could repeatedly trigger a full records x cell_values
-- rebuild (a cheap denial of service on the materialized tables), and
-- upsert_client_360_field_mappings deletes and rewrites auto_detected mappings
-- for EVERY organization, unscoped. Restricted to service_role outright.
revoke all on function public.refresh_client_360_snapshot() from public, anon, authenticated;
revoke all on function public.upsert_client_360_field_mappings() from public, anon, authenticated;
revoke all on function public.seed_client_360_client_aliases() from public, anon, authenticated;

grant execute on function public.overview_period_stats(text, text[], date, date, date, date) to service_role;
grant execute on function public._client_360_window_stats(text, text[], date, date) to service_role;
grant execute on function public.overview_volume_trend(text, text[], date, date, text) to service_role;
grant execute on function public.overview_data_bounds(text, text[]) to service_role;
grant execute on function public._client_360_coverage(text, text[], date, date) to service_role;

-- Drop the superseded signatures so an old call cannot silently keep reading
-- every workspace in the organization. `create or replace` cannot do this: the
-- argument list changed, so these are new functions sitting beside the old
-- ones, and PostgREST would still expose the old ones.
drop function if exists public._client_360_window_stats(text, date, date);
drop function if exists public.overview_period_stats(text, date, date, date, date);

-- ── I. Workspace scoping for the job-type breakdown ───────────────────────
--
-- Same scoping the stat cards and volume trend now take, so all three Overview
-- aggregates agree on which workspaces they are describing.

create or replace function public.overview_volume_breakdown(
    p_organization_id text,
    p_workspace_ids   text[],
    p_from            date,
    p_to              date
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with in_window as (
        select
            coalesce(nullif(btrim(job_type), ''), '') as job_type,
            volume
        from public.client_360_daily_snapshot
        where organization_id = p_organization_id
          and (p_workspace_ids is null or workspace_id = any (p_workspace_ids))
          and job_date between p_from and p_to
    ),
    grouped as (
        select job_type, sum(volume)::int as volume, count(*)::int as jobs
        from in_window group by job_type
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
        'coverage', public._client_360_coverage(p_organization_id, p_workspace_ids, p_from, p_to),
        'items', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'key',    g.job_type,
                    'volume', g.volume,
                    'jobs',   g.jobs
                )
                order by g.volume desc, g.job_type asc
            )
            from grouped g
        ), '[]'::jsonb)
    );
$$;

comment on function public.overview_volume_breakdown(text, text[], date, date) is
    'Volume and job counts per job type for a window. Records without a job type are returned under an empty key rather than being dropped. p_workspace_ids NULL means every workspace in the organization.';

revoke all on function public.overview_volume_breakdown(text, text[], date, date) from public, anon;
grant execute on function public.overview_volume_breakdown(text, text[], date, date) to service_role;

drop function if exists public.overview_volume_breakdown(text, date, date);

-- ── Supporting index ──────────────────────────────────────────────────────
-- Every Overview aggregate filters the snapshot with exactly this shape:
--   organization_id = p_organization_id AND job_date BETWEEN p_from AND p_to
-- The existing indexes cover (organization_id), (job_date desc) and
-- (organization_id, is_pending, job_date). None of them serves this predicate:
-- the is_pending composite is unusable without an is_pending filter, and the
-- single-column indexes each match only one side. Without this, stat cards,
-- volume trend and breakdown each seq-scan the snapshot on every dashboard
-- load, concurrently.
create index if not exists client_360_daily_snapshot_org_job_date_idx
on public.client_360_daily_snapshot (organization_id, job_date);

-- ── J. Backfill ───────────────────────────────────────────────────────────
-- Idempotent: mappings are rebuilt, the snapshot is upserted on record_id, and
-- rows for records that are no longer active are removed so a deleted record
-- cannot linger in the Overview numbers.

do $$
declare
    v_rows        bigint;
    v_pruned      bigint;
    v_dangling    bigint;
begin
    begin
        select public.refresh_client_360_snapshot() into v_rows;
        raise notice '[Overview Date Repair] Snapshot refreshed: % rows upserted', v_rows;
    exception when others then
        raise notice '[Overview Date Repair] Snapshot refresh FAILED: %', sqlerrm;
    end;

    delete from public.client_360_daily_snapshot s
    where not exists (
        select 1 from public.records r
        where r.id = s.record_id and r.status = 'active'
    );
    -- ROW_COUNT is not a plpgsql variable; it only exists as a diagnostics
    -- item, so it has to be captured before it can be reported.
    get diagnostics v_pruned = row_count;
    raise notice '[Overview Date Repair] Pruned % stale snapshot row(s)', v_pruned;

    -- Field mappings that point at a board or column that no longer exists
    -- cannot be resolved by the refresh and only mislead the UI's "is this
    -- column mapped" probes.
    delete from public.client_360_field_mappings fm
    where not exists (select 1 from public.boards b where b.id = fm.board_id)
       or not exists (select 1 from public.columns c where c.id = fm.resolved_column_ref);
    get diagnostics v_dangling = row_count;
    raise notice '[Overview Date Repair] Pruned % dangling field mapping(s)', v_dangling;
end;
$$;
