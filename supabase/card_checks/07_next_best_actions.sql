-- ============================================================================
-- Card check: Next Best Actions (one card per board+batch, max 5)
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
   AND fm.field_type IN ('batch_job_id','receive_date','job_status')
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
jobs AS (
  SELECT
    cr.record_id,
    cr.board_id,
    MAX(CASE WHEN rv.field_type = 'batch_job_id' THEN coalesce(rv.value_text, rv.value::text) END) AS batch_id,
    MAX(CASE WHEN rv.field_type = 'job_status' THEN coalesce(rv.value_text, rv.value::text) END) AS status
  FROM client_records cr
  LEFT JOIN record_values rv ON rv.record_id = cr.record_id AND rv.board_id = cr.board_id
  GROUP BY cr.record_id, cr.board_id
),
pending AS (
  SELECT j.*,
    CASE
      WHEN coalesce(j.status,'') = '' OR j.status IS NULL THEN 'Unknown'
      WHEN lower(j.status) IN ('done','completed','delivered','approved') THEN 'Done'
      ELSE 'Pending'
    END AS bucket
  FROM jobs j
  WHERE coalesce(j.status,'') <> ''
)
SELECT
  coalesce(batch_id, '(no batch)') AS batch_id,
  MAX(board_name) AS board_name,
  COUNT(*) AS pending_jobs,
  STRING_AGG(record_id, ', ') AS job_ids
FROM pending p
JOIN contributing_boards cb ON cb.board_id = p.board_id
WHERE bucket = 'Pending'
GROUP BY coalesce(batch_id, '(no batch)')
ORDER BY pending_jobs DESC
LIMIT 5;
