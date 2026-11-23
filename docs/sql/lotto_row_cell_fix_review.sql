-- LOTTO row (record 1dc1c97a-3193-42eb-a848-1aa9398b2503) cell-fix SQL (DO NOT RUN without review)
-- Board: November 2026 (4b0bd58f-ebeb-4f8d-92be-47be50033225, slug nov-2026-i1a6)
-- Board link: /boards/4b0bd58f-ebeb-4f8d-92be-47be50033225?record=1dc1c97a-3193-42eb-a848-1aa9398b2503
-- Job title: LOTTO
-- Client column: Client/Company Name (2a6e3033-95ee-4d61-bb42-fe952bfeae98, text)
-- Current client cell value/value_text: SAFARI-Genie
-- Decision pending: confirm whether correct client is LOTTO or SAFARI-Genie, then run the matching fix.

-- Verify current cell
SELECT cv.record_id, cv.board_id, cv.column_id, c.label AS column_label, cv.value, cv.value_text
FROM public.cell_values cv
JOIN public.columns c ON c.id = cv.column_id
WHERE cv.organization_id = 'org-1792039761662-m59i0f8'
  AND cv.board_id = '4b0bd58f-ebeb-4f8d-92be-47be50033225'
  AND cv.record_id = '1dc1c97a-3193-42eb-a848-1aa9398b2503'
  AND cv.column_id = '2a6e3033-95ee-4d61-bb42-fe952bfeae98';

-- If correct client is LOTTO:
-- UPDATE public.cell_values
-- SET value = to_jsonb('LOTTO'::text), value_text = 'LOTTO'
-- WHERE organization_id = 'org-1792039761662-m59i0f8'
--   AND board_id = '4b0bd58f-ebeb-4f8d-92be-47be50033225'
--   AND record_id = '1dc1c97a-3193-42eb-a848-1aa9398b2503'
--   AND column_id = '2a6e3033-95ee-4d61-bb42-fe952bfeae98';

-- If correct client is SAFARI-Genie (no change needed to cell; record title may need review separately):
-- -- no-op
