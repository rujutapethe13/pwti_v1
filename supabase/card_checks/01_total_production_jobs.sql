-- ============================================================================
-- Card check: Total Production Jobs
-- Resolves columns through client_360_field_mappings.
-- Replace <org_id> and <client_name> before running in the Supabase SQL Editor.
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
-- Active, non-Practice boards contributing records for this client.
contributing_boards AS (
  SELECT DISTINCT b.id AS board_id, b.name AS board_name
  FROM client_360_daily_snapshot s
  JOIN boards b ON b.id = s.board_id
  WHERE s.client_id IN (SELECT client_id FROM client_ids)
    AND b.organization_id = '<org_id>'
    AND b.status = 'active'
    AND b.name NOT ILIKE '%practice%'
),
-- Field mappings resolved per board (column_id per field_type).
board_fields AS (
  SELECT cb.board_id, fm.field_type, fm.resolved_column_ref AS column_id
  FROM contributing_boards cb
  JOIN client_360_field_mappings fm
    ON fm.board_id = cb.board_id
   AND fm.organization_id = '<org_id>'
   AND fm.field_type IN (
     'batch_job_id','receive_date','upload_date','job_status',
     'sku_count','image_count','invoice_amount','invoice_status','assignee_owner'
   )
),
-- Client records on contributing boards.
client_records AS (
  SELECT s.record_id, s.board_id, s.job_date
  FROM client_360_daily_snapshot s
  WHERE s.client_id IN (SELECT client_id FROM client_ids)
    AND s.board_id IN (SELECT board_id FROM contributing_boards)
),
-- Per-record field values resolved through mappings.
record_values AS (
  SELECT cr.record_id, cr.board_id, bf.field_type, cv.value, cv.value_text
  FROM client_records cr
  JOIN board_fields bf ON bf.board_id = cr.board_id
  JOIN cell_values cv
    ON cv.board_id = cr.board_id
   AND cv.record_id = cr.record_id
   AND cv.column_id = bf.column_id
)
-- KPI: total active production jobs on active, non-Practice boards.
SELECT COUNT(DISTINCT cr.record_id) AS total_production_jobs
FROM client_records cr;

-- Boards contributing (job count + last updated).
SELECT
  cb.board_id,
  cb.board_name,
  COUNT(cr.record_id) AS job_count,
  MAX(cr.job_date) AS last_job_date
FROM contributing_boards cb
LEFT JOIN client_records cr ON cr.board_id = cb.board_id
GROUP BY cb.board_id, cb.board_name
ORDER BY cb.board_name;
