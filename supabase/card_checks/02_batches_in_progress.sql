-- ============================================================================
-- Card check: Batches in progress
-- Resolves columns through client_360_field_mappings.
-- Replace <org_id> and <client_name> before running.
-- ============================================================================

WITH client_ids AS (
  SELECT c.id AS client_id
  FROM client_360_clients c
  WHERE c.organization_id = '<org_id>'
    AND lower(regexp_replace(trim(c.canonical_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim('<client_name>'), '\s+', ' ', 'g'))
  UNION
  SELECT a.client_id
  FROM client_360_client_aliases a
  JOIN client_360_clients c ON c.id = a.client_id
  WHERE c.organization_id = '<org_id>'
    AND lower(regexp_replace(trim(a.alias_text), '\s+', ' ', 'g')) = lower(regexp_replace(trim('<client_name>'), '\s+', ' ', 'g'))
),
contributing_boards AS (
  SELECT DISTINCT b.id AS board_id, b.name AS board_name
  FROM client_360_daily_snapshot s
  JOIN boards b ON b.id = s.board_id
  WHERE s.client_id IN (SELECT client_id FROM client_ids)
    AND b.organization_id = '<org_id>'
    AND b.status = 'active'
    AND b.name NOT ILIKE '%practice%'
),
board_fields AS (
  SELECT cb.board_id, fm.field_type, fm.resolved_column_ref AS column_id
  FROM contributing_boards cb
  JOIN client_360_field_mappings fm
    ON fm.board_id = cb.board_id
   AND fm.organization_id = '<org_id>'
   AND fm.field_type IN ('batch_job_id','receive_date','upload_date','job_status','assignee_owner')
),
client_records AS (
  SELECT s.record_id, s.board_id, s.job_date
  FROM client_360_daily_snapshot s
  WHERE s.client_id IN (SELECT client_id FROM client_ids)
    AND s.board_id IN (SELECT board_id FROM contributing_boards)
),
record_values AS (
  SELECT cr.record_id, cr.board_id, bf.field_type, cv.value, cv.value_text
  FROM client_records cr
  JOIN board_fields bf ON bf.board_id = cr.board_id
  JOIN cell_values cv
    ON cv.board_id = cr.board_id
   AND cv.record_id = cr.record_id
   AND cv.column_id = bf.column_id
),
-- Pivot: one row per record with its field values.
jobs AS (
  SELECT
    cr.record_id,
    cr.board_id,
    MAX(CASE WHEN rv.field_type = 'batch_job_id' THEN coalesce(rv.value_text, rv.value::text) END) AS batch_id,
    MAX(CASE WHEN rv.field_type = 'receive_date' THEN rv.value_text END) AS receive_date,
    MAX(CASE WHEN rv.field_type = 'upload_date' THEN rv.value_text END) AS upload_date,
    MAX(CASE WHEN rv.field_type = 'job_status' THEN coalesce(rv.value_text, rv.value::text) END) AS status,
    MAX(CASE WHEN rv.field_type = 'assignee_owner' THEN coalesce(rv.value_text, rv.value::text) END) AS assignee
  FROM client_records cr
  LEFT JOIN record_values rv ON rv.record_id = cr.record_id AND rv.board_id = cr.board_id
  GROUP BY cr.record_id, cr.board_id
),
job_statuses AS (
  SELECT
    j.*,
    CASE
      WHEN coalesce(j.status,'') = '' OR j.status IS NULL THEN 'Unknown'
      WHEN lower(j.status) IN ('done','completed','delivered','approved','finished','resolved','closed')
           OR lower(j.status) LIKE '%done%' OR lower(j.status) LIKE '%complete%'
           OR lower(j.status) LIKE '%delivered%' OR lower(j.status) LIKE '%approved%' THEN 'Done'
      WHEN lower(j.status) IN ('in progress','active','queued','started')
           OR lower(j.status) LIKE '%progress%' OR lower(j.status) LIKE '%active%' OR lower(j.status) LIKE '%started%' THEN 'In progress'
      WHEN lower(j.status) IN ('not started','pending','todo','backlog')
           OR lower(j.status) LIKE '%not started%' OR lower(j.status) LIKE '%pending%' THEN 'Waiting'
      ELSE 'Unknown'
    END AS bucket
  FROM jobs j
)
SELECT
  COUNT(*) FILTER (WHERE bucket <> 'Done') AS batches_in_progress,
  COUNT(*) FILTER (WHERE bucket = 'Done') AS batches_done,
  COUNT(*) AS total_batches
FROM (
  SELECT batch_id, bool_or(bucket <> 'Done') AS any_pending, bool_or(bucket = 'Done') AS any_done
  FROM job_statuses
  GROUP BY batch_id
) b;

-- Per-batch detail table.
SELECT
  coalesce(batch_id, '(no batch)') AS batch_id,
  COUNT(*) AS jobs,
  COUNT(*) FILTER (WHERE bucket = 'Done') AS done,
  COUNT(*) FILTER (WHERE bucket <> 'Done') AS pending,
  MIN(receive_date)::date AS oldest_received,
  MAX(assignee) AS assignee
FROM job_statuses
GROUP BY coalesce(batch_id, '(no batch)')
ORDER BY pending DESC, jobs DESC;
