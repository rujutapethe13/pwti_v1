-- ============================================================================
-- Card check: Monthly Production Throughput
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
  SELECT DISTINCT b.id AS board_id
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
   AND fm.field_type IN ('sku_count','invoice_amount','receive_date','upload_date')
),
client_records AS (
  SELECT s.record_id, s.board_id
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
    MAX(CASE WHEN rv.field_type = 'sku_count' THEN coalesce(rv.value_text, rv.value::text)::numeric END) AS skus,
    MAX(CASE WHEN rv.field_type = 'invoice_amount' THEN coalesce(rv.value_text, rv.value::text)::numeric END) AS amount,
    coalesce(
      MAX(CASE WHEN rv.field_type = 'receive_date' THEN rv.value_text END),
      MAX(CASE WHEN rv.field_type = 'upload_date' THEN rv.value_text END)
    ) AS dt
  FROM client_records cr
  LEFT JOIN record_values rv ON rv.record_id = cr.record_id AND rv.board_id = cr.board_id
  GROUP BY cr.record_id
)
SELECT
  to_char(dt::date, 'YYYY-MM') AS month,
  COUNT(*) AS jobs_received,
  COALESCE(SUM(skus), 0) AS skus,
  COALESCE(SUM(amount), 0) AS invoiced_amount
FROM jobs
WHERE dt IS NOT NULL
GROUP BY 1
ORDER BY 1;
