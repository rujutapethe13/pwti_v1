-- ============================================================================
-- Card check: Health score
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
   AND fm.field_type IN ('receive_date','upload_date','sku_count','invoice_status')
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
    MAX(CASE WHEN rv.field_type = 'receive_date' THEN rv.value_text END) AS receive_date,
    MAX(CASE WHEN rv.field_type = 'upload_date' THEN rv.value_text END) AS upload_date,
    MAX(CASE WHEN rv.field_type = 'sku_count' THEN coalesce(rv.value_text, rv.value::text)::numeric END) AS skus,
    MAX(CASE WHEN rv.field_type = 'invoice_status' THEN coalesce(rv.value_text, rv.value::text) END) AS inv_status
  FROM client_records cr
  LEFT JOIN record_values rv ON rv.record_id = cr.record_id AND rv.board_id = cr.board_id
  GROUP BY cr.record_id
)
SELECT
  COUNT(*) AS total_jobs,
  COUNT(*) FILTER (WHERE receive_date IS NOT NULL AND upload_date IS NOT NULL) AS jobs_with_dates,
  COUNT(*) FILTER (WHERE amount_or_status_present) AS jobs_with_invoice -- placeholder below
FROM (
  SELECT *,
    (coalesce(skus,0) > 0 OR inv_status IS NOT NULL) AS amount_or_status_present
  FROM jobs
) j;

-- Health factors summary.
SELECT
  CASE
    WHEN COUNT(*) FILTER (WHERE receive_date IS NOT NULL AND upload_date IS NOT NULL) = 0
         AND NOT bool_or(coalesce(skus,0) > 0 OR inv_status IS NOT NULL)
         AND COUNT(*) = 0
    THEN 'not enough data'
    ELSE 'scored'
  END AS health_state,
  COUNT(*) AS jobs,
  COUNT(*) FILTER (WHERE receive_date IS NOT NULL AND upload_date IS NOT NULL) AS with_dates,
  COALESCE(SUM(skus),0) AS total_skus,
  COUNT(*) FILTER (WHERE inv_status IS NOT NULL) AS with_invoice,
  COUNT(*) FILTER (WHERE lower(inv_status) = 'paid') AS invoices_paid
FROM (
  SELECT *,
    (coalesce(skus,0) > 0 OR inv_status IS NOT NULL) AS amount_or_status_present
  FROM (
    SELECT record_id,
      MAX(CASE WHEN field_type='receive_date' THEN value_text END) AS receive_date,
      MAX(CASE WHEN field_type='upload_date' THEN value_text END) AS upload_date,
      MAX(CASE WHEN field_type='sku_count' THEN coalesce(value_text,value::text)::numeric END) AS skus,
      MAX(CASE WHEN field_type='invoice_status' THEN coalesce(value_text,value::text) END) AS inv_status
    FROM client_records cr
    LEFT JOIN record_values rv ON rv.record_id=cr.record_id AND rv.board_id=cr.board_id
    GROUP BY cr.record_id
  ) j
) jj;
