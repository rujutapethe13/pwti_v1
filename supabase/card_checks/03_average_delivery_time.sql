-- ============================================================================
-- Card check: Average delivery time
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
   AND fm.field_type IN ('receive_date','upload_date','job_status')
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
    MAX(CASE WHEN rv.field_type = 'receive_date' THEN rv.value_text END) AS receive_date,
    MAX(CASE WHEN rv.field_type = 'upload_date' THEN rv.value_text END) AS upload_date,
    MAX(CASE WHEN rv.field_type = 'job_status' THEN coalesce(rv.value_text, rv.value::text) END) AS status
  FROM client_records cr
  LEFT JOIN record_values rv ON rv.record_id = cr.record_id AND rv.board_id = cr.board_id
  GROUP BY cr.record_id
),
with_dates AS (
  SELECT *,
    (receive_date)::date AS rd,
    (upload_date)::date AS ud,
    (upload_date)::date - (receive_date)::date AS days
  FROM jobs
  WHERE receive_date IS NOT NULL AND upload_date IS NOT NULL
)
SELECT
  COUNT(*) AS jobs_counted,
  (SELECT COUNT(*) FROM jobs) - COUNT(*) AS jobs_skipped_missing_date,
  CASE WHEN COUNT(*) > 0 THEN round(AVG(days)::numeric, 1) END AS avg_delivery_days
FROM with_dates;

-- Monthly average (line chart).
SELECT
  to_char(rd, 'YYYY-MM') AS month,
  round(AVG(days)::numeric, 2) AS avg_days
FROM with_dates
GROUP BY 1
ORDER BY 1;

-- Histogram (1, 2, 3, 4+ days).
SELECT
  CASE
    WHEN days <= 1 THEN '1 day'
    WHEN days = 2 THEN '2 days'
    WHEN days = 3 THEN '3 days'
    ELSE '4+ days'
  END AS days_bucket,
  COUNT(*) AS count
FROM with_dates
GROUP BY 1
ORDER BY
  CASE WHEN days_bucket='1 day' THEN 1 WHEN days_bucket='2 days' THEN 2
       WHEN days_bucket='3 days' THEN 3 ELSE 4 END;

-- Slowest 10 jobs.
SELECT record_id, receive_date, upload_date, days, status
FROM with_dates
ORDER BY days DESC NULLS LAST
LIMIT 10;
