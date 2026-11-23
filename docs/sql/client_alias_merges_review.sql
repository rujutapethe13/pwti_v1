-- ONE review SQL file: confirmed alias/client merges (DO NOT RUN without review)
-- Org: org-1792039761662-m59i0f8
-- Canonical targets (keep): levis, safari, labbada, bioweaves, nasher miles, papa don't preach
-- Retire duplicates by setting merged_into_client_id (nullable) rather than deleting.
-- After applying: selectors/resolvers must skip rows where merged_into_client_id IS NOT NULL.
-- Before/after job counts per target (same live-scope rules: active non-Practice boards, active non-archived records,
-- client resolved by alias table wins on normalized alias_text). Read-only in-memory simulation 2026-11-18:
--   levis (993faa0f): before 0 (retirees resolved: levi's ea704ab4=68, levi strauss & co 5452b58f=1, levis strauss & co 5aee6f28=5) -> after 74. needs_confirmation -> false.
--   safari (929d4094): before 45 (retirees: safari select bcdee70a=1, safari-genie 0b3b9f91=2) -> after 48 (combined {929d4094,bcdee70a,0b3b9f91}=48 before/after). needs_confirmation -> false.
--   labbada (a3ab0608): before 1 (retiree labada 28655dde=2) -> after 3.
--   bioweaves (a0b82279): before 8 (retiree bioweave a9902f44=0) -> after 8.
--   nasher miles (5683b3fc): before 23 (retiree nasher mile 524c93f2=0) -> after 23.
--   papa don't preach (0aa8f0d5): before 3 (retirees 9f07b34b=0, 62a9f155=0) -> after 3.
--   Lotto total (e20db933, unchanged): 50 before/after.

-- STEP 0 (schema, separate statement): add nullable merge pointer
ALTER TABLE public.client_360_clients
  ADD COLUMN IF NOT EXISTS merged_into_client_id text NULL;

-- STEP 1 (review): current state for involved clients
SELECT c.id, c.canonical_name, c.needs_confirmation, c.merged_into_client_id,
       (SELECT count(*) FROM public.client_360_client_aliases a WHERE a.client_id = c.id AND a.organization_id = c.organization_id) AS alias_count
FROM public.client_360_clients c
WHERE c.organization_id = 'org-1792039761662-m59i0f8'
  AND c.id IN (
    '993faa0f-9ebc-4acb-8327-50a88906ceed','ea704ab4-dcd5-4deb-9741-b4c6a69faab7','5452b58f-a5d4-4008-9f9b-fa1c853e6f6b','5aee6f28-e191-46ba-ba89-d381d4d8a3c3',
    '929d4094-f94d-4897-a567-fcc4e2fc6e5d','bcdee70a-bc02-437a-aafc-0d6c69d8e54f','0b3b9f91-4ac1-47eb-92ea-d63e5c09d3c4',
    'a3ab0608-353e-4717-a731-81ece0bafc14','28655dde-6f8f-4f7f-bf51-b58af044822f',
    'a0b82279-a391-4f1e-a8bc-e559e6246ee3','a9902f44-3f65-485b-8765-5d7258c70e5f',
    '5683b3fc-e060-4a97-8d88-bdee57c83010','524c93f2-0454-4f8e-ba75-3c1fa9d73429',
    '0aa8f0d5-2060-4705-b1dd-8c2997fb26aa','9f07b34b-1a8d-46ec-a01c-a57412112778','62a9f155-4e0c-46d0-85ab-ea02c8e8315b'
  )
ORDER BY c.canonical_name, c.id;

-- STEP 2 (apply): merge pairs inside a transaction
BEGIN;

-- 2a. levis: target 993faa0f absorbs ea704ab4 (levi's), 5452b58f (levi strauss & co), 5aee6f28 (levis strauss & co)
UPDATE public.client_360_client_aliases a
SET client_id = '993faa0f-9ebc-4acb-8327-50a88906ceed'
WHERE a.organization_id = 'org-1792039761662-m59i0f8'
  AND a.client_id IN ('ea704ab4-dcd5-4deb-9741-b4c6a69faab7','5452b58f-a5d4-4008-9f9b-fa1c853e6f6b','5aee6f28-e191-46ba-ba89-d381d4d8a3c3')
  AND NOT EXISTS (
    SELECT 1 FROM public.client_360_client_aliases x
    WHERE x.organization_id = a.organization_id
      AND x.client_id = '993faa0f-9ebc-4acb-8327-50a88906ceed'
      AND lower(regexp_replace(trim(replace(replace(x.alias_text, E'\u2019',''''), '''','')), '\s+', ' ', 'g'))
        = lower(regexp_replace(trim(replace(replace(a.alias_text, E'\u2019',''''), '''','')), '\s+', ' ', 'g'))
  );
DELETE FROM public.client_360_client_aliases a
WHERE a.organization_id = 'org-1792039761662-m59i0f8'
  AND a.client_id IN ('ea704ab4-dcd5-4deb-9741-b4c6a69faab7','5452b58f-a5d4-4008-9f9b-fa1c853e6f6b','5aee6f28-e191-46ba-ba89-d381d4d8a3c3');
UPDATE public.client_360_daily_snapshot SET client_id = '993faa0f-9ebc-4acb-8327-50a88906ceed'
WHERE organization_id = 'org-1792039761662-m59i0f8' AND client_id IN ('ea704ab4-dcd5-4deb-9741-b4c6a69faab7','5452b58f-a5d4-4008-9f9b-fa1c853e6f6b','5aee6f28-e191-46ba-ba89-d381d4d8a3c3');
UPDATE public.client_360_clients SET merged_into_client_id = '993faa0f-9ebc-4acb-8327-50a88906ceed'
WHERE organization_id = 'org-1792039761662-m59i0f8' AND id IN ('ea704ab4-dcd5-4deb-9741-b4c6a69faab7','5452b58f-a5d4-4008-9f9b-fa1c853e6f6b','5aee6f28-e191-46ba-ba89-d381d4d8a3c3');
UPDATE public.client_360_clients SET needs_confirmation = false, updated_at = now()
WHERE organization_id = 'org-1792039761662-m59i0f8' AND id = '993faa0f-9ebc-4acb-8327-50a88906ceed';

-- 2b. safari: target 929d4094 absorbs bcdee70a (safari select), 0b3b9f91 (safari-genie)
UPDATE public.client_360_client_aliases a
SET client_id = '929d4094-f94d-4897-a567-fcc4e2fc6e5d'
WHERE a.organization_id = 'org-1792039761662-m59i0f8'
  AND a.client_id IN ('bcdee70a-bc02-437a-aafc-0d6c69d8e54f','0b3b9f91-4ac1-47eb-92ea-d63e5c09d3c4')
  AND NOT EXISTS (
    SELECT 1 FROM public.client_360_client_aliases x
    WHERE x.organization_id = a.organization_id
      AND x.client_id = '929d4094-f94d-4897-a567-fcc4e2fc6e5d'
      AND lower(regexp_replace(trim(replace(replace(x.alias_text, E'\u2019',''''), '''','')), '\s+', ' ', 'g'))
        = lower(regexp_replace(trim(replace(replace(a.alias_text, E'\u2019',''''), '''','')), '\s+', ' ', 'g'))
  );
DELETE FROM public.client_360_client_aliases a
WHERE a.organization_id = 'org-1792039761662-m59i0f8'
  AND a.client_id IN ('bcdee70a-bc02-437a-aafc-0d6c69d8e54f','0b3b9f91-4ac1-47eb-92ea-d63e5c09d3c4');
UPDATE public.client_360_daily_snapshot SET client_id = '929d4094-f94d-4897-a567-fcc4e2fc6e5d'
WHERE organization_id = 'org-1792039761662-m59i0f8' AND client_id IN ('bcdee70a-bc02-437a-aafc-0d6c69d8e54f','0b3b9f91-4ac1-47eb-92ea-d63e5c09d3c4');
UPDATE public.client_360_clients SET merged_into_client_id = '929d4094-f94d-4897-a567-fcc4e2fc6e5d'
WHERE organization_id = 'org-1792039761662-m59i0f8' AND id IN ('bcdee70a-bc02-437a-aafc-0d6c69d8e54f','0b3b9f91-4ac1-47eb-92ea-d63e5c09d3c4');
UPDATE public.client_360_clients SET needs_confirmation = false, updated_at = now()
WHERE organization_id = 'org-1792039761662-m59i0f8' AND id = '929d4094-f94d-4897-a567-fcc4e2fc6e5d';

-- 2c. labbada: target a3ab0608 absorbs 28655dde (labada)
UPDATE public.client_360_client_aliases a SET client_id = 'a3ab0608-353e-4717-a731-81ece0bafc14'
WHERE a.organization_id = 'org-1792039761662-m59i0f8' AND a.client_id = '28655dde-6f8f-4f7f-bf51-b58af044822f'
  AND NOT EXISTS (SELECT 1 FROM public.client_360_client_aliases x WHERE x.organization_id=a.organization_id AND x.client_id='a3ab0608-353e-4717-a731-81ece0bafc14' AND lower(regexp_replace(trim(replace(replace(x.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')) = lower(regexp_replace(trim(replace(replace(a.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')));
DELETE FROM public.client_360_client_aliases a WHERE a.organization_id='org-1792039761662-m59i0f8' AND a.client_id='28655dde-6f8f-4f7f-bf51-b58af044822f';
UPDATE public.client_360_daily_snapshot SET client_id='a3ab0608-353e-4717-a731-81ece0bafc14' WHERE organization_id='org-1792039761662-m59i0f8' AND client_id='28655dde-6f8f-4f7f-bf51-b58af044822f';
UPDATE public.client_360_clients SET merged_into_client_id='a3ab0608-353e-4717-a731-81ece0bafc14' WHERE organization_id='org-1792039761662-m59i0f8' AND id='28655dde-6f8f-4f7f-bf51-b58af044822f';

-- 2d. bioweaves: target a0b82279 absorbs a9902f44 (bioweave)
UPDATE public.client_360_client_aliases a SET client_id = 'a0b82279-a391-4f1e-a8bc-e559e6246ee3'
WHERE a.organization_id = 'org-1792039761662-m59i0f8' AND a.client_id = 'a9902f44-3f65-485b-8765-5d7258c70e5f'
  AND NOT EXISTS (SELECT 1 FROM public.client_360_client_aliases x WHERE x.organization_id=a.organization_id AND x.client_id='a0b82279-a391-4f1e-a8bc-e559e6246ee3' AND lower(regexp_replace(trim(replace(replace(x.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')) = lower(regexp_replace(trim(replace(replace(a.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')));
DELETE FROM public.client_360_client_aliases a WHERE a.organization_id='org-1792039761662-m59i0f8' AND a.client_id='a9902f44-3f65-485b-8765-5d7258c70e5f';
UPDATE public.client_360_daily_snapshot SET client_id='a0b82279-a391-4f1e-a8bc-e559e6246ee3' WHERE organization_id='org-1792039761662-m59i0f8' AND client_id='a9902f44-3f65-485b-8765-5d7258c70e5f';
UPDATE public.client_360_clients SET merged_into_client_id='a0b82279-a391-4f1e-a8bc-e559e6246ee3' WHERE organization_id='org-1792039761662-m59i0f8' AND id='a9902f44-3f65-485b-8765-5d7258c70e5f';

-- 2e. nasher miles: target 5683b3fc absorbs 524c93f2 (nasher mile)
UPDATE public.client_360_client_aliases a SET client_id = '5683b3fc-e060-4a97-8d88-bdee57c83010'
WHERE a.organization_id = 'org-1792039761662-m59i0f8' AND a.client_id = '524c93f2-0454-4f8e-ba75-3c1fa9d73429'
  AND NOT EXISTS (SELECT 1 FROM public.client_360_client_aliases x WHERE x.organization_id=a.organization_id AND x.client_id='5683b3fc-e060-4a97-8d88-bdee57c83010' AND lower(regexp_replace(trim(replace(replace(x.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')) = lower(regexp_replace(trim(replace(replace(a.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')));
DELETE FROM public.client_360_client_aliases a WHERE a.organization_id='org-1792039761662-m59i0f8' AND a.client_id='524c93f2-0454-4f8e-ba75-3c1fa9d73429';
UPDATE public.client_360_daily_snapshot SET client_id='5683b3fc-e060-4a97-8d88-bdee57c83010' WHERE organization_id='org-1792039761662-m59i0f8' AND client_id='524c93f2-0454-4f8e-ba75-3c1fa9d73429';
UPDATE public.client_360_clients SET merged_into_client_id='5683b3fc-e060-4a97-8d88-bdee57c83010' WHERE organization_id='org-1792039761662-m59i0f8' AND id='524c93f2-0454-4f8e-ba75-3c1fa9d73429';

-- 2f. papa don't preach: target 0aa8f0d5 absorbs 9f07b34b (papa don,t peach), 62a9f155 (papa dont peach)
UPDATE public.client_360_client_aliases a SET client_id = '0aa8f0d5-2060-4705-b1dd-8c2997fb26aa'
WHERE a.organization_id = 'org-1792039761662-m59i0f8' AND a.client_id IN ('9f07b34b-1a8d-46ec-a01c-a57412112778','62a9f155-4e0c-46d0-85ab-ea02c8e8315b')
  AND NOT EXISTS (SELECT 1 FROM public.client_360_client_aliases x WHERE x.organization_id=a.organization_id AND x.client_id='0aa8f0d5-2060-4705-b1dd-8c2997fb26aa' AND lower(regexp_replace(trim(replace(replace(x.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')) = lower(regexp_replace(trim(replace(replace(a.alias_text,E'\u2019',''''),'''','')),'\s+',' ','g')));
DELETE FROM public.client_360_client_aliases a WHERE a.organization_id='org-1792039761662-m59i0f8' AND a.client_id IN ('9f07b34b-1a8d-46ec-a01c-a57412112778','62a9f155-4e0c-46d0-85ab-ea02c8e8315b');
UPDATE public.client_360_daily_snapshot SET client_id='0aa8f0d5-2060-4705-b1dd-8c2997fb26aa' WHERE organization_id='org-1792039761662-m59i0f8' AND client_id IN ('9f07b34b-1a8d-46ec-a01c-a57412112778','62a9f155-4e0c-46d0-85ab-ea02c8e8315b');
UPDATE public.client_360_clients SET merged_into_client_id='0aa8f0d5-2060-4705-b1dd-8c2997fb26aa' WHERE organization_id='org-1792039761662-m59i0f8' AND id IN ('9f07b34b-1a8d-46ec-a01c-a57412112778','62a9f155-4e0c-46d0-85ab-ea02c8e8315b');

COMMIT;

-- STEP 3 (review after): verify targets/retired
SELECT c.id, c.canonical_name, c.needs_confirmation, c.merged_into_client_id
FROM public.client_360_clients c
WHERE c.organization_id = 'org-1792039761662-m59i0f8'
  AND c.id IN (
    '993faa0f-9ebc-4acb-8327-50a88906ceed','ea704ab4-dcd5-4deb-9741-b4c6a69faab7','5452b58f-a5d4-4008-9f9b-fa1c853e6f6b','5aee6f28-e191-46ba-ba89-d381d4d8a3c3',
    '929d4094-f94d-4897-a567-fcc4e2fc6e5d','bcdee70a-bc02-437a-aafc-0d6c69d8e54f','0b3b9f91-4ac1-47eb-92ea-d63e5c09d3c4',
    'a3ab0608-353e-4717-a731-81ece0bafc14','28655dde-6f8f-4f7f-bf51-b58af044822f',
    'a0b82279-a391-4f1e-a8bc-e559e6246ee3','a9902f44-3f65-485b-8765-5d7258c70e5f',
    '5683b3fc-e060-4a97-8d88-bdee57c83010','524c93f2-0454-4f8e-ba75-3c1fa9d73429',
    '0aa8f0d5-2060-4705-b1dd-8c2997fb26aa','9f07b34b-1a8d-46ec-a01c-a57412112778','62a9f155-4e0c-46d0-85ab-ea02c8e8315b'
  )
ORDER BY coalesce(c.merged_into_client_id, c.id), c.canonical_name;
