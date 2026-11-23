-- ============================================================================
-- Client 360 per-card SQL verification script
-- ============================================================================
-- Usage: Run against the live Supabase database (SQL Editor).
-- Replace every '<CLIENT_NAME>' placeholder with the canonical client name.
--
-- Prerequisites:
--   - client_360_field_mappings must be populated for the client's boards
--   - client_360_daily_snapshot must be refreshed (refresh_client_360_snapshot())
-- ============================================================================

-- ── 0. Resolve client → contributing boards (edit the client name below) ────
with client_resolved as (
  select c.id as client_id, c.organization_id as org_id, c.canonical_name
  from public.client_360_clients c
  where c.canonical_name = '<CLIENT_NAME>'
  union
  select c.id, c.organization_id, c.canonical_name
  from public.client_360_client_aliases a
  join public.client_360_clients c on c.id = a.client_id
  where a.alias_text = '<CLIENT_NAME>'
  limit 1
),
client_boards as (
  select distinct s.board_id, b.name as board_name, s.organization_id
  from public.client_360_daily_snapshot s
  join client_resolved cr on cr.org_id = s.organization_id
  join public.boards b on b.id = s.board_id
  where b.status = 'active'
    and lower(b.name) not like '%practice%'
),
-- Field type → column_id per board
board_fields as (
  select cb.board_id, cb.board_name, cb.organization_id,
         fm.field_type, fm.resolved_column_ref as column_id
  from client_boards cb
  join public.client_360_field_mappings fm
    on fm.board_id = cb.board_id
   and fm.organization_id = cb.organization_id
),
-- Pivot: one row per board with column_id per field type
board_cols as (
  select board_id, board_name, organization_id,
    max(case when field_type = 'client' then column_id end) as client_col,
    max(case when field_type = 'receive_date' then column_id end) as receive_date_col,
    max(case when field_type = 'upload_date' then column_id end) as upload_date_col,
    max(case when field_type = 'job_status' then column_id end) as status_col,
    max(case when field_type = 'sku_count' then column_id end) as sku_count_col,
    max(case when field_type = 'image_count' then column_id end) as image_count_col,
    max(case when field_type = 'invoice_amount' then column_id end) as invoice_amount_col,
    max(case when field_type = 'invoice_status' then column_id end) as invoice_status_col,
    max(case when field_type = 'batch_job_id' then column_id end) as batch_job_id_col,
    max(case when field_type = 'assignee_owner' then column_id end) as assignee_col
  from board_fields
  group by board_id, board_name, organization_id
),
-- All cell values for mapped columns on contributing boards
board_cells as (
  select bc.board_id, bc.board_name,
         cv.record_id, cv.column_id, cv.value, cv.value_text
  from board_cols bc
  join public.cell_values cv
    on cv.board_id = bc.board_id
   and cv.column_id in (
     bc.client_col, bc.receive_date_col, bc.upload_date_col, bc.status_col,
     bc.sku_count_col, bc.image_count_col, bc.invoice_amount_col,
     bc.invoice_status_col, bc.batch_job_id_col, bc.assignee_col
   )
   and cv.column_id is not null
),
-- Join cells to records
jobs_raw as (
  select bc.board_id, bc.board_name,
         r.id as record_id, r.title as job_title,
         cv.column_id, cv.value, cv.value_text
  from board_cols bc
  join public.records r on r.board_id = bc.board_id
  left join board_cells cv on cv.record_id = r.id and cv.board_id = bc.board_id
  where r.archived_at is null
),
-- One row per job with raw cell values
jobs as (
  select
    board_id, board_name, record_id, job_title,
    max(case when column_id = status_col then value_text end) as status_text,
    max(case when column_id = receive_date_col then value_text end) as receive_date_text,
    max(case when column_id = upload_date_col then value_text end) as upload_date_text,
    max(case when column_id = sku_count_col then value_text end) as sku_count_text,
    max(case when column_id = image_count_col then value_text end) as image_count_text,
    max(case when column_id = invoice_amount_col then value_text end) as invoice_amount_text,
    max(case when column_id = invoice_status_col then value_text end) as invoice_status_text,
    max(case when column_id = batch_job_id_col then value_text end) as batch_id_text,
    max(case when column_id = assignee_col then value_text end) as assignee_text
  from jobs_raw, board_cols bc2
  where jobs_raw.board_id = bc2.board_id
  group by board_id, board_name, record_id, job_title,
           status_col, receive_date_col, upload_date_col,
           sku_count_col, image_count_col, invoice_amount_col,
           invoice_status_col, batch_job_id_col, assignee_col
),
-- Parse numbers and dates (best-effort; unparseable → NULL)
jobs_parsed as (
  select *,
    nullif(regexp_replace(sku_count_text, '[^0-9.]', '', 'g'), '')::numeric as sku_count,
    nullif(regexp_replace(image_count_text, '[^0-9.]', '', 'g'), '')::numeric as image_count,
    nullif(regexp_replace(invoice_amount_text, '[^0-9.-]', '', 'g'), '')::numeric as invoice_amount,
    case
      when receive_date_text ~ '^\d{4}-\d{2}-\d{2}' then receive_date_text::date
      else null
    end as receive_date,
    case
      when upload_date_text ~ '^\d{4}-\d{2}-\d{2}' then upload_date_text::date
      else null
    end as upload_date,
    case
      when lower(trim(coalesce(status_text, ''))) = '' or lower(trim(coalesce(status_text, ''))) = 'unspecified' then 'Unknown'
      when lower(trim(coalesce(status_text, ''))) in ('done','completed','delivered','approved','finished','resolved','closed')
           or lower(trim(coalesce(status_text, ''))) like '%complete%'
           or lower(trim(coalesce(status_text, ''))) like '%delivered%'
           or lower(trim(coalesce(status_text, ''))) like '%approved%'
           or lower(trim(coalesce(status_text, ''))) like '%finished%'
           or lower(trim(coalesce(status_text, ''))) like '%resolved%'
           or lower(trim(coalesce(status_text, ''))) like '%closed%' then 'Done'
      when lower(trim(coalesce(status_text, ''))) in ('in progress','active','queued','started')
           or lower(trim(coalesce(status_text, ''))) like '%progress%'
           or (lower(trim(coalesce(status_text, ''))) like '%active%' and lower(trim(coalesce(status_text, ''))) not like '%not%')
           or lower(trim(coalesce(status_text, ''))) like '%queued%'
           or (lower(trim(coalesce(status_text, ''))) like '%started%' and lower(trim(coalesce(status_text, ''))) not like '%not started%') then 'In progress'
      when lower(trim(coalesce(status_text, ''))) in ('not started','pending','todo','backlog')
           or lower(trim(coalesce(status_text, ''))) like '%pending%'
           or lower(trim(coalesce(status_text, ''))) like '%todo%'
           or lower(trim(coalesce(status_text, ''))) like '%backlog%' then 'Waiting'
      else 'Unknown'
    end as status_bucket
  from jobs
)
-- ── CARD 1: Total production jobs ───────────────────────────────────────────
select 'total-jobs' as card, count(*) as value, null::text as detail
from jobs_parsed
union all
-- ── CARD 2: Batches in progress ─────────────────────────────────────────────
select 'batches-in-progress' as card,
       count(distinct batch_id_text) as value,
       null::text as detail
from jobs_parsed
where batch_id_text is not null and batch_id_text <> '' and status_bucket <> 'Done'
union all
-- ── CARD 3: Average delivery time (days) ────────────────────────────────────
select 'average-delivery-time' as card,
       round(avg(extract(epoch from (upload_date - receive_date))) / 86400.0, 1)::numeric as value,
       count(*)::text || ' jobs with both dates' as detail
from jobs_parsed
where receive_date is not null and upload_date is not null
union all
-- ── CARD 4: SKUs processed ──────────────────────────────────────────────────
select 'skus-processed' as card,
       coalesce(sum(sku_count), 0)::numeric as value,
       count(*) filter (where sku_count is not null)::text || ' jobs with SKU data' as detail
from jobs_parsed
union all
-- ── CARD 5: Invoiced (total amount) ─────────────────────────────────────────
select 'invoiced' as card,
       coalesce(sum(invoice_amount), 0)::numeric as value,
       count(*) filter (where invoice_amount is not null)::text || ' jobs with invoice data' as detail
from jobs_parsed
union all
-- ── CARD 6: Health score (composite) ────────────────────────────────────────
select 'health-score' as card,
       case when count(*) = 0 then null
            when count(*) filter (where receive_date is not null and upload_date is not null) = 0
              and count(*) filter (where invoice_amount is not null) = 0 then null
            else round(
              coalesce(
                case when count(*) filter (where receive_date is not null and upload_date is not null) > 0 then
                  case when avg(extract(epoch from (upload_date - receive_date))) / 86400.0 <= 2 then 100
                       else greatest(0, 100 - round((avg(extract(epoch from (upload_date - receive_date))) / 86400.0 - 2) * 20))
                  end
                end, 0)
              + case when coalesce(sum(sku_count), 0) > 0 then 100 else 0 end
              + case when count(*) filter (where invoice_amount is not null) > 0 then
                round(100.0 * count(*) filter (where lower(invoice_status_text) = 'paid')
                      / nullif(count(*) filter (where invoice_amount is not null), 0))
                else 0 end
              + least(100, count(*) * 10)
              , 4) / 4
       end::numeric as value,
       count(*)::text || ' jobs evaluated' as detail
from jobs_parsed
union all
-- ── CARD 7: Next best actions ───────────────────────────────────────────────
select 'next-best-actions' as card,
       count(distinct board_id || '::' || coalesce(batch_id_text, '(no batch)')) as value,
       count(*)::text || ' pending jobs across groups' as detail
from jobs_parsed
where status_bucket <> 'Done'
union all
-- ── CARD 8: Monthly throughput (jobs per month) ─────────────────────────────
select 'monthly-throughput' as card,
       count(*) as value,
       to_char(coalesce(receive_date, upload_date), 'YYYY-MM') as detail
from jobs_parsed
where receive_date is not null or upload_date is not null
group by 3
order by card, detail;

-- ── Missing mappings per board ──────────────────────────────────────────────
select
  bc.board_name as board,
  string_agg(ft, ', ' order by ft) as missing_field_types
from board_cols bc
where bc.receive_date_col is null
   or bc.upload_date_col is null
   or bc.status_col is null
   or bc.sku_count_col is null
   or bc.invoice_amount_col is null
   or bc.invoice_status_col is null
group by bc.board_name
order by bc.board_name;
