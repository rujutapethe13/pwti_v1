-- Overview 30-day verification script
-- Returns total jobs received in last 30 days + per-day counts
-- Uses same rules as getLiveJobScope: IST midnight boundary, active boards, Practice excluded, field mappings
-- Compare these numbers to Overview UI "Jobs received" card and volume trend bars

WITH params AS (
  SELECT
    (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today_ist,
    (NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '29 days' AS start_ist
),
-- Get active board IDs (non-Practice, non-archived) for current org
active_boards AS (
  SELECT b.id AS board_id
  FROM boards b
  JOIN workspaces w ON w.id = b.workspace_id
  JOIN organizations o ON o.id = w.organization_id
  WHERE w.type <> 'personal'
    AND b.archived_at IS NULL
    AND w.name NOT ILIKE '%practice%'
    AND o.id = current_setting('app.current_org_id', true)::uuid
),
-- Get field mappings for client, received_date, upload_date, due_date, job_type, status
field_mappings AS (
  SELECT
    m.board_id,
    m.column_id,
    c.label AS column_label,
    m.field_type
  FROM client_360_field_mappings m
  JOIN columns c ON c.id = m.column_id
  WHERE m.field_type IN ('client', 'received_date', 'upload_date', 'due_date', 'job_type', 'status')
    AND m.board_id IN (SELECT board_id FROM active_boards)
),
-- Pivot mappings per board
board_fields AS (
  SELECT
    board_id,
    MAX(CASE WHEN field_type = 'client' THEN column_id END) AS client_col,
    MAX(CASE WHEN field_type = 'received_date' THEN column_id END) AS received_col,
    MAX(CASE WHEN field_type = 'upload_date' THEN column_id END) AS upload_col,
    MAX(CASE WHEN field_type = 'due_date' THEN column_id END) AS due_col,
    MAX(CASE WHEN field_type = 'job_type' THEN column_id END) AS job_type_col,
    MAX(CASE WHEN field_type = 'status' THEN column_id END) AS status_col,
    MAX(CASE WHEN field_type = 'client' THEN column_label END) AS client_col_label
  FROM field_mappings
  GROUP BY board_id
),
-- Get cell values for mapped columns on active boards
cell_data AS (
  SELECT
    cv.record_id,
    cv.column_id,
    cv.value_text,
    cv.value_date,
    cv.value_number,
    r.board_id,
    r.group_id,
    r.workspace_id
  FROM cell_values cv
  JOIN records r ON r.id = cv.record_id
  WHERE r.board_id IN (SELECT board_id FROM active_boards)
    AND r.archived_at IS NULL
    AND cv.column_id IN (
      SELECT client_col FROM board_fields UNION
      SELECT received_col FROM board_fields UNION
      SELECT upload_col FROM board_fields UNION
      SELECT due_col FROM board_fields UNION
      SELECT job_type_col FROM board_fields UNION
      SELECT status_col FROM board_fields
    )
),
-- Pivot cell data per record
record_values AS (
  SELECT
    cd.record_id,
    cd.board_id,
    cd.workspace_id,
    cd.group_id,
    MAX(CASE WHEN cd.column_id = bf.client_col THEN cd.value_text END) AS client_raw,
    MAX(CASE WHEN cd.column_id = bf.received_col THEN
      CASE
        WHEN cd.value_date IS NOT NULL THEN cd.value_date
        WHEN cd.value_text IS NOT NULL THEN _client_360_parse_date(cd.value_text)
      END
    END) AS received_date,
    MAX(CASE WHEN cd.column_id = bf.upload_col THEN
      CASE
        WHEN cd.value_date IS NOT NULL THEN cd.value_date
        WHEN cd.value_text IS NOT NULL THEN _client_360_parse_date(cd.value_text)
      END
    END) AS upload_date,
    MAX(CASE WHEN cd.column_id = bf.due_col THEN
      CASE
        WHEN cd.value_date IS NOT NULL THEN cd.value_date
        WHEN cd.value_text IS NOT NULL THEN _client_360_parse_date(cd.value_text)
      END
    END) AS due_date,
    MAX(CASE WHEN cd.column_id = bf.job_type_col THEN cd.value_text END) AS job_type,
    MAX(CASE WHEN cd.column_id = bf.status_col THEN cd.value_text END) AS status,
    bf.client_col_label
  FROM cell_data cd
  JOIN board_fields bf ON bf.board_id = cd.board_id
  GROUP BY cd.record_id, cd.board_id, cd.workspace_id, cd.group_id, bf.client_col_label
),
-- Apply client alias resolution (same as getLiveJobScope)
resolved_clients AS (
  SELECT
    rv.*,
    COALESCE(
      ca.canonical_name,
      rv.client_raw
    ) AS client_resolved,
    CASE WHEN ca.canonical_name IS NOT NULL THEN true ELSE false END AS client_matched
  FROM record_values rv
  LEFT JOIN client_360_aliases ca
    ON ca.raw_name ILIKE rv.client_raw
    AND ca.organization_id = current_setting('app.current_org_id', true)::uuid
    AND ca.active = true
),
-- Filter to last 30 days (IST) using received_date
filtered AS (
  SELECT
    rc.*,
    (rc.received_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS received_ist_date
  FROM resolved_clients rc
  WHERE rc.received_date IS NOT NULL
    AND (rc.received_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= (SELECT start_ist FROM params)
    AND (rc.received_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= (SELECT today_ist FROM params)
)
-- Total count (should match "Jobs received" card)
SELECT
  'total' AS metric,
  COUNT(*) AS count,
  NULL::date AS bucket_date
FROM filtered

UNION ALL

-- Per-day counts (should match volume trend bars)
SELECT
  'daily' AS metric,
  COUNT(*) AS count,
  received_ist_date AS bucket_date
FROM filtered
GROUP BY received_ist_date
ORDER BY bucket_date;

-- Also show missing received dates count (for admin message)
SELECT
  'missing_received' AS metric,
  COUNT(*) AS count,
  NULL::date AS bucket_date
FROM resolved_clients
WHERE received_date IS NULL
  AND board_id IN (SELECT board_id FROM active_boards);