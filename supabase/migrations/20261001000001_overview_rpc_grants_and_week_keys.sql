-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20261001000001: Overview RPC grants, week keys and index
--
-- Follow-up to 20261001000000_overview_date_pipeline_repair.sql. That migration
-- was already applied to the live database through the dashboard SQL Editor, so
-- the statements here are what actually change this database. They are also
-- idempotent, and the same fixes were made in the source migration, so a fresh
-- environment that applies both in order ends up in the same state either way.
--
-- Apply this file whole through the dashboard SQL Editor, newest last.
--
-- A. SECURITY. Postgres grants EXECUTE to PUBLIC on every new function, and
--    `grant execute ... to authenticated` ADDS to that rather than replacing
--    it. Verified live before this migration: with the anon key, a 500 response
--    from `refresh_client_360_snapshot` proved the call was accepted and began
--    running before timing out (a trivially repeatable anonymous rebuild of the
--    snapshot), `upsert_client_360_field_mappings` returned 200 and deleted and
--    rewrote auto_detected mappings across EVERY organization, and
--    `overview_period_stats` / `overview_data_bounds` returned any organization's
--    aggregates and date bounds for an arbitrary `p_organization_id` with no
--    membership check. These functions are SECURITY DEFINER and so bypass the
--    snapshot's RLS entirely; the workspace filter inside them is a scoping
--    convenience, not an authorization boundary.
--
--    Nothing in this application calls these RPCs from the browser. They are
--    reached exclusively through service_role on the server, so revoking
--    `authenticated` as well costs nothing and closes the cross-tenant read.
--
-- B. WEEK KEYS. date_trunc('week', ...) returns the ISO Monday. The TypeScript
--    axis uses startOfWeek(), which subtracts getDay() and therefore starts weeks
--    on SUNDAY. For any window of 32-120 days (the 90d preset) no server key
--    could ever match the axis, so every weekly bucket resolved to zero and the
--    chart rendered a flat line. The function below subtracts a day so both sides
--    speak the same Sunday-based week.
--
--    The same rewrite also fixes the completed series, which was derived from a
--    CTE already filtered on job_date. A job completed inside the window whose
--    received date predates it was never counted, so the chart disagreed with the
--    "Jobs completed" stat card.
--
-- C. INDEX. Every Overview aggregate filters on
--    organization_id = ... AND job_date BETWEEN ... and no existing index serves
--    that shape, so stat cards, volume trend and breakdown each seq-scanned the
--    snapshot on every dashboard load, concurrently.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A. Close the anonymous / cross-tenant access ───────────────────────────

revoke all on function public.overview_period_stats(text, text[], date, date, date, date) from public, anon, authenticated;
revoke all on function public._client_360_window_stats(text, text[], date, date) from public, anon, authenticated;
revoke all on function public.overview_volume_trend(text, text[], date, date, text) from public, anon, authenticated;
revoke all on function public.overview_data_bounds(text, text[]) from public, anon, authenticated;
revoke all on function public._client_360_coverage(text, text[], date, date) from public, anon, authenticated;
revoke all on function public.overview_volume_breakdown(text, text[], date, date) from public, anon, authenticated;

-- Mutate global state: the worst case of the same problem.
revoke all on function public.refresh_client_360_snapshot() from public, anon, authenticated;
revoke all on function public.upsert_client_360_field_mappings() from public, anon, authenticated;
revoke all on function public.seed_client_360_client_aliases() from public, anon, authenticated;

-- Helpers are not SECURITY DEFINER but are still internal.
revoke all on function public.bucket_key(date, text) from public, anon, authenticated;
revoke all on function public._client_360_normalize_date_text(text) from public, anon, authenticated;
revoke all on function public._client_360_date_column_populated_count(text) from public, anon, authenticated;
revoke all on function public._client_360_job_date_hint_rank(text) from public, anon, authenticated;

grant execute on function public.overview_period_stats(text, text[], date, date, date, date) to service_role;
grant execute on function public._client_360_window_stats(text, text[], date, date) to service_role;
grant execute on function public.overview_volume_trend(text, text[], date, date, text) to service_role;
grant execute on function public.overview_data_bounds(text, text[]) to service_role;
grant execute on function public._client_360_coverage(text, text[], date, date) to service_role;
grant execute on function public.overview_volume_breakdown(text, text[], date, date) to service_role;
grant execute on function public.refresh_client_360_snapshot() to service_role;
grant execute on function public.upsert_client_360_field_mappings() to service_role;
grant execute on function public.seed_client_360_client_aliases() to service_role;

-- ── B. Sunday-aligned week buckets, independent completed series ───────────

create or replace function public.overview_volume_trend(
    p_organization_id text,
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
    with settings as (
        select case
            when p_granularity in ('day', 'week', 'month') then p_granularity
            else 'day'
        end as gran
    ),
    -- Date filtering deliberately happens per series, not here. Deriving both
    -- series from a CTE already constrained to job_date silently dropped every
    -- job completed inside the window whose received date predated it.
    scoped as (
        select s.job_date, s.completed_date, s.volume
        from public.client_360_daily_snapshot s
        where s.organization_id = p_organization_id
          and (p_workspace_ids is null or s.workspace_id = any (p_workspace_ids))
    ),
    received as (
        select
            -- ISO Monday from date_trunc, minus one day, to match the client's
            -- Sunday-based startOfWeek().
            case
                when (select gran from settings) = 'week'
                    then date_trunc('week', s.job_date)::date - 1
                else date_trunc((select gran from settings), s.job_date)::date
            end as bucket,
            -- count(*) so this means the same thing as the "Jobs received" card.
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
        'received', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'key',    bucket_key(r.bucket, (select gran from settings)),
                    'jobs',   r.jobs,
                    'volume', r.volume
                )
                order by r.bucket
            )
            from received r
        ), '[]'::jsonb),
        'completed', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'key',    bucket_key(c.bucket, (select gran from settings)),
                    'jobs',   c.jobs,
                    'volume', c.volume
                )
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
    'Received and completed counts bucketed in SQL over the real job_date / completed_date DATE columns. Week buckets are aligned to SUNDAY to match the client axis (date_trunc returns the ISO Monday). jobs is a count(*) so it matches the "Jobs received" stat card; volume is reported separately. p_workspace_ids NULL means every workspace in the organization.';

-- ── C. Index for the predicate every Overview aggregate uses ───────────────

create index if not exists client_360_daily_snapshot_org_job_date_idx
on public.client_360_daily_snapshot (organization_id, job_date);

-- ── Proof ──────────────────────────────────────────────────────────────────
-- Watch for these in the notice output; they are the difference between "the
-- script ran" and "the script did the thing".

do $$
declare
    v_idx  boolean;
    v_cnt  int;
begin
    select count(*) > 0 into v_idx
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'client_360_daily_snapshot_org_job_date_idx';

    if v_idx then
        raise notice '[Overview Follow-up] supporting index is present';
    else
        raise notice '[Overview Follow-up] FAILED: supporting index is MISSING';
    end if;

    -- After the revokes, anon must be unable to read an organization's totals.
    -- `has_function_privilege` answers for the role, without executing anything.
    select count(*) into v_cnt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
          'overview_period_stats', 'overview_volume_trend', 'overview_data_bounds',
          'overview_volume_breakdown', '_client_360_window_stats', '_client_360_coverage',
          'refresh_client_360_snapshot', 'upsert_client_360_field_mappings',
          'seed_client_360_client_aliases'
      )
      and has_function_privilege('anon', p.oid, 'execute');

    if v_cnt = 0 then
        raise notice '[Overview Follow-up] anon can no longer execute any Overview RPC';
    else
        raise notice '[Overview Follow-up] FAILED: % function(s) still executable by anon', v_cnt;
    end if;
end;
$$;
