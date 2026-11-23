-- ============================================================================
-- Migration: 20261117020000_client_360_sku_count_seed.sql
-- Client 360 corrections — DO NOT RUN until you confirm.
--
-- Sections (run separately, in order):
--   1. CHECK constraint fix (extended field_type list)
--   2. unique(board_id, field_type) guard for ON CONFLICT
--   3. v_client_360_field_mappings view with security_invoker = true
--   4. Label-matched seed PREVIEW (SELECT only — no writes)
--   5. Label-matched seed INSERT (run only after reviewing section 4)
--   6. Corrected seed_client_360_client_aliases flagging rule
--   7. _client_360_preserve_confirmation trigger (denylist only, no elsif)
-- ============================================================================

-- ── SECTION 1: Extend the field_type CHECK constraint ────────────────────────
-- Allowed: existing client/job_date/volume plus due_date/status/completed_date
-- (from overview_period_stats) plus sku_count, image_count,
-- batch_job_id, upload_date, receive_date, job_status, invoice_amount,
-- invoice_status, assignee_owner. No "admin metadata" catch-all.

alter table public.client_360_field_mappings
  drop constraint if exists client_360_field_mappings_field_type_check;

alter table public.client_360_field_mappings
  add constraint client_360_field_mappings_field_type_check
  check (field_type in (
    'client', 'job_date', 'volume',
    'due_date', 'status', 'completed_date', 'job_type',
    'sku_count', 'image_count',
    'batch_job_id', 'upload_date', 'receive_date', 'job_status',
    'invoice_amount', 'invoice_status', 'assignee_owner'
  ));

-- ── SECTION 2: Ensure unique(board_id, field_type) for ON CONFLICT ───────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_360_field_mappings'::regclass
      and contype = 'u'
      and conname = 'client_360_field_mappings_board_id_field_type_key'
  ) then
    alter table public.client_360_field_mappings
      add constraint client_360_field_mappings_board_id_field_type_key
      unique (board_id, field_type);
  end if;
end;
$$;

-- ── SECTION 3: View with security_invoker = true ─────────────────────────────
-- Runs under the caller's RLS. Pair with an org-scoped RLS policy on
-- client_360_field_mappings (the blanket owner-only policy does not filter by
-- organization_id) to prevent cross-org leaks.

create or replace view public.v_client_360_field_mappings
with (security_invoker = true)
as
select
    board_id,
    organization_id,
    field_type,
    resolved_column_ref,
    source,
    confidence,
    created_at,
    updated_at
from public.client_360_field_mappings;

-- ── SECTION 4: Label-matched seed PREVIEW (SELECT only — no writes) ──────────
-- Matches columns per board by normalized label (lowercase, whitespace
-- collapsed, case-insensitive). A row is included only when exactly one column
-- matches for that (board, field_type); missing or multi-match labels are
-- left out. Review this output before running section 5.

with targets(field_type, acceptable_labels) as (
    values
        ('sku_count',      array['no. of skus','no of skus','number of skus','sku count','skus']),
        ('image_count',    array['no. of images','no of images','number of images','image count','images']),
        ('batch_job_id',   array['batch job id','batch_job_id','job id','batch id']),
        ('upload_date',    array['upload date','uploaded date','date uploaded']),
        ('receive_date',   array['receive date post production','receive date','receive date post-production']),
        ('job_status',     array['status','job status']),
        ('invoice_amount', array['invoice amount','amount']),
        ('invoice_status', array['invoice status','status']),
        ('assignee_owner', array['assignee owner','owner','assignee'])
),
norm_cols as (
    select c.id, c.board_id, c.label,
           lower(regexp_replace(trim(c.label), '\s+', ' ', 'g')) as norm_label,
           b.organization_id
    from public.columns c
    join public.boards b on b.id = c.board_id
),
matches as (
    select nc.board_id, b.name as board_name, t.field_type,
           nc.id as column_id, nc.label as column_label,
           count(*) over (partition by nc.board_id, t.field_type) as match_count
    from norm_cols nc
    join targets t on nc.norm_label = any(t.acceptable_labels)
    join public.boards b on b.id = nc.board_id
)
select board_id, board_name, field_type, column_id, column_label
from matches
where match_count = 1
order by board_name, field_type;

-- ── SECTION 5: Label-matched seed INSERT (run AFTER reviewing section 4) ─────
-- Un-comment / run only once you have verified the preview output. One row per
-- (board_id, field_type) matched by label. Rows with missing/multi-match
-- labels are omitted automatically by the WHERE match_count = 1 filter.

/*
insert into public.client_360_field_mappings
    (board_id, organization_id, field_type, resolved_column_ref, source, confidence)
with targets(field_type, acceptable_labels) as (
    values
        ('sku_count',      array['no. of skus','no of skus','number of skus','sku count','skus']),
        ('image_count',    array['no. of images','no of images','number of images','image count','images']),
        ('batch_job_id',   array['batch job id','batch_job_id','job id','batch id']),
        ('upload_date',    array['upload date','uploaded date','date uploaded']),
        ('receive_date',   array['receive date post production','receive date','receive date post-production']),
        ('job_status',     array['status','job status']),
        ('invoice_amount', array['invoice amount','amount']),
        ('invoice_status', array['invoice status','status']),
        ('assignee_owner', array['assignee owner','owner','assignee'])
),
norm_cols as (
    select c.id, c.board_id, c.label,
           lower(regexp_replace(trim(c.label), '\s+', ' ', 'g')) as norm_label,
           b.organization_id
    from public.columns c
    join public.boards b on b.id = c.board_id
),
matches as (
    select nc.board_id, nc.organization_id, t.field_type, nc.id as column_id,
           count(*) over (partition by nc.board_id, t.field_type) as match_count
    from norm_cols nc
    join targets t on nc.norm_label = any(t.acceptable_labels)
)
select board_id, organization_id, field_type, column_id, 'manual_override', 1.0
from matches
where match_count = 1
on conflict (board_id, field_type) do nothing;
*/

-- ── SECTION 6: Corrected seed_client_360_client_aliases flagging rule ────────
-- Diff vs. 20260909000000:
--   - needs_confirmation was `d.variant_count > 1`, which wrongly flagged
--     case-only / whitespace-only variants (they normalize to the same name).
--   - Now always false: normalization collapses case + whitespace, so same-client
--     variants merge automatically without a review flag.
--   - Removed the variant_count-based needs_confirmation counting (Pass 3).
--   - Genuinely ambiguous names must be flagged manually via the review list.

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
    perform public.upsert_client_360_field_mappings();

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

    -- Pass 1: upsert canonical clients (never flag on variant_count)
    insert into public.client_360_clients (organization_id, canonical_name, needs_confirmation, created_at, updated_at)
    select distinct
        d.organization_id,
        d.normalized_name,
        false as needs_confirmation,
        now(), now()
    from _c360_dupes d
    on conflict (organization_id, canonical_name) do update
        set needs_confirmation = false,
            updated_at = now();

    get diagnostics v_clients_created = row_count;

    -- Pass 2: insert aliases
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

    -- Pass 3: count clients needing confirmation (seed never sets the flag)
    select count(*) into v_needs_confirmation
    from public.client_360_clients c
    where c.needs_confirmation = true;

    return query select v_clients_created, v_aliases_created, v_needs_confirmation;
end;
$$;

-- ── SECTION 7: _client_360_preserve_confirmation trigger (denylist only) ─────
-- Removed the "elsif ... old.needs_confirmation" branch so manual unhides are
-- not reverted. Only the denylist and length <= 2 rules remain.

create or replace function public._client_360_preserve_confirmation()
returns trigger
language plpgsql
as $$
declare
  v_name text := lower(regexp_replace(trim(new.canonical_name), '\s+', ' ', 'g'));
begin
  if v_name in (
    'a', 'apperals', 'backpack', 'bag', 'bottle', 'flatlay',
    'footwear', 'product', 'trolley bag'
  ) or length(v_name) <= 2 then
    new.needs_confirmation := true;
  end if;
  return new;
end;
$$;

drop trigger if exists client_360_preserve_confirmation
  on public.client_360_clients;

create trigger client_360_preserve_confirmation
before insert or update of canonical_name, needs_confirmation
on public.client_360_clients
for each row
execute function public._client_360_preserve_confirmation();
