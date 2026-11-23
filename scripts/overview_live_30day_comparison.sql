-- 30-day Jobs Received comparison (live rules, IST calendar days)
-- Org: org-1792039761662-m59i0f8
-- READ ONLY. Uses same live job-scope rules as Overview:
--   - boards: status = 'active' and name not ilike '%practice%'
--   - records: status = 'active' and archived_at is null
--   - received date column: client_360_field_mappings.field_type in ('receive_date','job_date')
--     (prefer receive_date over job_date per board)
--   - date parsed from cell value/value_text and treated as IST calendar day (YYYY-MM-DD)
--   - window: [today IST - 29 days, today IST] inclusive
with params as (
  select
    'org-1792039761662-m59i0f8'::text as org_id,
    (timezone('Asia/Kolkata', now()))::date as today_ist,
    ((timezone('Asia/Kolkata', now()))::date - 29) as from_ist
),
active_boards as (
  select b.id, b.name
  from public.boards b
  join params p on b.organization_id = p.org_id
  where b.status = 'active'
    and coalesce(b.name, '') not ilike '%practice%'
),
receive_map as (
  select distinct on (m.board_id)
    m.board_id,
    m.resolved_column_ref as column_id,
    m.field_type
  from public.client_360_field_mappings m
  join params p on m.organization_id = p.org_id
  join active_boards ab on ab.id = m.board_id
  where m.field_type in ('receive_date', 'job_date')
  order by m.board_id, case when m.field_type = 'receive_date' then 0 else 1 end
),
active_records as (
  select r.id as record_id, r.board_id
  from public.records r
  join params p on r.organization_id = p.org_id
  join active_boards ab on ab.id = r.board_id
  where r.status = 'active'
    and r.archived_at is null
),
raw_cells as (
  select
    ar.board_id,
    ar.record_id,
    cv.value,
    cv.value_text
  from active_records ar
  join receive_map rm on rm.board_id = ar.board_id
  left join public.cell_values cv
    on cv.record_id = ar.record_id
   and cv.board_id = ar.board_id
   and cv.column_id = rm.column_id
),
normalized as (
  select
    board_id,
    record_id,
    nullif(btrim(coalesce(
      value_text,
      case
        when jsonb_typeof(value) = 'string' then trim(both '"' from value::text)
        when jsonb_typeof(value) = 'number' then value::text
        when jsonb_typeof(value) = 'boolean' then value::text
        when jsonb_typeof(value) = 'object' then coalesce(
          value->>'date', value->>'value', value->>'start', value->>'end', value->>'text', value->>'iso'
        )
        else null
      end
    )), '') as raw_text
  from raw_cells
),
parsed as (
  select
    board_id,
    record_id,
    raw_text,
    case
      when raw_text ~ '^\d{4}-\d{2}-\d{2}' then substring(raw_text from 1 for 10)::date
      when raw_text ~ '^\d{1,2}[/-]\d{1,2}[/-]\d{4}' then
        case
          when split_part(regexp_replace(substring(raw_text from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'), '[/-]', '/', 'g'), '/', 1)::int > 12
            then to_date(substring(raw_text from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'), 'DD/MM/YYYY')
          when split_part(regexp_replace(substring(raw_text from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'), '[/-]', '/', 'g'), '/', 2)::int > 12
            then to_date(substring(raw_text from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'), 'MM/DD/YYYY')
          else to_date(substring(raw_text from '^\d{1,2}[/-]\d{1,2}[/-]\d{4}'), 'DD/MM/YYYY')
        end
      else null
    end as received_day
  from normalized
  where raw_text is not null
),
in_window as (
  select p.received_day
  from parsed p, params pa
  where p.received_day between pa.from_ist and pa.today_ist
),
summary as (
  select count(*)::int as jobs_received_30d from in_window
),
per_day as (
  select received_day as day_ist, count(*)::int as jobs_received
  from in_window
  group by received_day
)
select 'summary'::text as row_type, (select from_ist::text from params) as day_ist, jobs_received_30d::int as jobs_received
from summary
union all
select 'day'::text as row_type, day_ist::text, jobs_received
from per_day
order by row_type desc, day_ist;
