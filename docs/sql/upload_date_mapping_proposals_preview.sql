-- Upload-date mapping proposals (preview SELECT only, NO INSERT). Org: org-1792039761662-m59i0f8
-- November board has no upload-date mapping: boards without upload/completed mapping must show
-- "No upload date column on <board>" in delivery-time and Completed panels (not zero).

-- Active boards and whether upload/completed mapping exists
SELECT b.id AS board_id, b.name AS board_name,
       MAX(CASE WHEN m.field_type = 'upload_date' THEN m.resolved_column_ref END) AS upload_date_mapping,
       MAX(CASE WHEN m.field_type = 'completed_date' THEN m.resolved_column_ref END) AS completed_date_mapping
FROM public.boards b
LEFT JOIN public.client_360_field_mappings m
  ON m.board_id = b.id AND m.organization_id = b.organization_id AND m.field_type IN ('upload_date','completed_date')
WHERE b.organization_id = 'org-1792039761662-m59i0f8'
  AND b.status = 'active'
  AND b.name !~* 'practice'
GROUP BY b.id, b.name
ORDER BY b.name;

-- Proposed upload_date column per board missing mapping (date-like upload/deliver/completed labels)
-- Populated counts are from live capture 2026-11-18:
-- April 2026      9471d966-9a80-4047-af16-478ef145dcc8 Date of Upload date populated=16
-- May 2026        5d93f84b-24bf-42da-9da3-70bf45ecaac5 Date of Upload date populated=25
-- March 2026      f3be41aa-3882-46bf-805e-900bb9d1bd1a Date of Upload date populated=26
-- June 2026       b97aafea-1c77-4fa6-a8a7-2549473e76c0 Date of Upload date populated=25
-- July 2026       782dba94-d6fb-470d-905a-93799e0ff444 Date of Upload date populated=29
-- September 2026  326e05af-f268-4104-aa0c-47c2e94b456a Date of Upload date populated=36
-- February 2026   809f34a1-2009-43e9-9786-06bb968f92f5 Date of Upload date populated=40
-- October 2026    5fb7a0fe-f611-428f-9e4a-5319f60f163d Date of Upload date populated=13
-- August 2026     08d9c405-e23f-45e4-a457-6c6558d3b3bb Date of Upload date populated=33
-- January 2026    ab266d16-cbab-4b86-bbdd-79001d5fcf7b Date of Upload date populated=36
-- November 2026   96752bf9-0336-4fff-b0ab-3bb74c15addb Date of upload date populated=10

-- Generic preview of candidate columns (review per board before any insert):
SELECT c.board_id, b.name AS board_name, c.id AS column_id, c.label, c.type
FROM public.columns c
JOIN public.boards b ON b.id = c.board_id
WHERE c.organization_id = 'org-1792039761662-m59i0f8'
  AND b.organization_id = 'org-1792039761662-m59i0f8'
  AND b.status = 'active'
  AND b.name !~* 'practice'
  AND c.label ~* '(upload|deliver|completed|complete|final|handover|sent|dispatch|done date|finish)'
ORDER BY b.name, c.label;
