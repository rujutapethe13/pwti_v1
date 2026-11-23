-- Alias conflicts: alias_text (normalized) points to a client different from a canonical client
-- that has the same normalized name. Review only; DO NOT run changes automatically.
-- Resolver rule until decision: alias table wins (exact alias_text normalized lookup),
-- and conflicts must be flagged in admin "Needs review".

-- 1) Inspect all alias->canonical same-normalized-name conflicts (live snapshot captured 2026-11-18)
SELECT a.id AS alias_id,
       a.alias_text,
       lower(regexp_replace(trim(replace(replace(a.alias_text, E'\u2019', ''''), '''', '')), '\s+', ' ', 'g')) AS alias_norm,
       a.client_id AS points_to_client_id,
       c.canonical_name AS points_to_canonical,
       c.needs_confirmation AS points_to_needs_confirmation
FROM public.client_360_client_aliases a
JOIN public.client_360_clients c ON c.id = a.client_id AND c.organization_id = a.organization_id
WHERE a.organization_id = 'org-1792039761662-m59i0f8'
ORDER BY alias_norm, a.alias_text;

-- 2) Review candidates: aliases whose normalized text equals some other client's normalized canonical_name
SELECT a.id AS alias_id,
       a.alias_text,
       lower(regexp_replace(trim(replace(replace(a.alias_text, E'\u2019', ''''), '''', '')), '\s+', ' ', 'g')) AS alias_norm,
       a.client_id AS points_to_client_id,
       pc.canonical_name AS points_to_canonical,
       pc.needs_confirmation AS points_to_needs_confirmation,
       sc.id AS same_named_client_id,
       sc.canonical_name AS same_named_canonical,
       sc.needs_confirmation AS same_named_needs_confirmation
FROM public.client_360_client_aliases a
JOIN public.client_360_clients pc ON pc.id = a.client_id AND pc.organization_id = a.organization_id
JOIN public.client_360_clients sc
  ON sc.organization_id = a.organization_id
 AND sc.id <> a.client_id
 AND lower(regexp_replace(trim(replace(replace(sc.canonical_name, E'\u2019', ''''), '''', '')), '\s+', ' ', 'g'))
   = lower(regexp_replace(trim(replace(replace(a.alias_text, E'\u2019', ''''), '''', '')), '\s+', ' ', 'g'))
WHERE a.organization_id = 'org-1792039761662-m59i0f8'
ORDER BY alias_norm, a.alias_text, sc.canonical_name;

-- Captured conflict rows (JSON): [
    {
        "alias_id":  "1549f8e5-15c7-4f38-804b-83afc4c7fcb3",
        "alias_text":  "LEVI\u0027S",
        "alias_norm":  "levis",
        "points_to_client_id":  "ea704ab4-dcd5-4deb-9741-b4c6a69faab7",
        "points_to_canonical":  "levi\u0027s",
        "points_to_needs_confirmation":  false,
        "same_named_canonicals":  [
                                      {
                                          "id":  "993faa0f-9ebc-4acb-8327-50a88906ceed",
                                          "canonical_name":  "levis",
                                          "needs_confirmation":  true
                                      }
                                  ]
    },
    {
        "alias_id":  "93a004bb-83f9-4b54-b347-ed28d27ecb14",
        "alias_text":  "LEVIS",
        "alias_norm":  "levis",
        "points_to_client_id":  "993faa0f-9ebc-4acb-8327-50a88906ceed",
        "points_to_canonical":  "levis",
        "points_to_needs_confirmation":  true,
        "same_named_canonicals":  [
                                      {
                                          "id":  "ea704ab4-dcd5-4deb-9741-b4c6a69faab7",
                                          "canonical_name":  "levi\u0027s",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "ef6cf2fe-f57c-41a3-874e-9d65d8315ff6",
        "alias_text":  "Levis",
        "alias_norm":  "levis",
        "points_to_client_id":  "993faa0f-9ebc-4acb-8327-50a88906ceed",
        "points_to_canonical":  "levis",
        "points_to_needs_confirmation":  true,
        "same_named_canonicals":  [
                                      {
                                          "id":  "ea704ab4-dcd5-4deb-9741-b4c6a69faab7",
                                          "canonical_name":  "levi\u0027s",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "2b272e87-8845-4e6f-b89e-4297f9313739",
        "alias_text":  "levi\u0027s",
        "alias_norm":  "levis",
        "points_to_client_id":  "993faa0f-9ebc-4acb-8327-50a88906ceed",
        "points_to_canonical":  "levis",
        "points_to_needs_confirmation":  true,
        "same_named_canonicals":  [
                                      {
                                          "id":  "ea704ab4-dcd5-4deb-9741-b4c6a69faab7",
                                          "canonical_name":  "levi\u0027s",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "b24922c0-2cac-4a12-936f-a7eec00798a5",
        "alias_text":  "levi strauss \u0026 co",
        "alias_norm":  "levi strauss \u0026 co",
        "points_to_client_id":  "993faa0f-9ebc-4acb-8327-50a88906ceed",
        "points_to_canonical":  "levis",
        "points_to_needs_confirmation":  true,
        "same_named_canonicals":  [
                                      {
                                          "id":  "5452b58f-a5d4-4008-9f9b-fa1c853e6f6b",
                                          "canonical_name":  "levi strauss \u0026 co",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "fb4c7661-6480-408e-b037-31a3ed59faa6",
        "alias_text":  "levis strauss \u0026 co",
        "alias_norm":  "levis strauss \u0026 co",
        "points_to_client_id":  "993faa0f-9ebc-4acb-8327-50a88906ceed",
        "points_to_canonical":  "levis",
        "points_to_needs_confirmation":  true,
        "same_named_canonicals":  [
                                      {
                                          "id":  "5aee6f28-e191-46ba-ba89-d381d4d8a3c3",
                                          "canonical_name":  "levis strauss \u0026 co",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "aa27204c-db61-42e5-a47a-848d0abd2910",
        "alias_text":  "safari select",
        "alias_norm":  "safari select",
        "points_to_client_id":  "929d4094-f94d-4897-a567-fcc4e2fc6e5d",
        "points_to_canonical":  "safari",
        "points_to_needs_confirmation":  true,
        "same_named_canonicals":  [
                                      {
                                          "id":  "bcdee70a-bc02-437a-aafc-0d6c69d8e54f",
                                          "canonical_name":  "safari select",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "e80ee6c3-d094-4ab9-9416-c716cb506ff1",
        "alias_text":  "safari-genie",
        "alias_norm":  "safari-genie",
        "points_to_client_id":  "929d4094-f94d-4897-a567-fcc4e2fc6e5d",
        "points_to_canonical":  "safari",
        "points_to_needs_confirmation":  true,
        "same_named_canonicals":  [
                                      {
                                          "id":  "0b3b9f91-4ac1-47eb-92ea-d63e5c09d3c4",
                                          "canonical_name":  "safari-genie",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "a03f3f85-5629-4739-ab45-c882908b8c2f",
        "alias_text":  "labada",
        "alias_norm":  "labada",
        "points_to_client_id":  "a3ab0608-353e-4717-a731-81ece0bafc14",
        "points_to_canonical":  "labbada",
        "points_to_needs_confirmation":  false,
        "same_named_canonicals":  [
                                      {
                                          "id":  "28655dde-6f8f-4f7f-bf51-b58af044822f",
                                          "canonical_name":  "labada",
                                          "needs_confirmation":  true
                                      }
                                  ]
    },
    {
        "alias_id":  "1cacd81b-0d82-41ab-9736-2757d7ea7d45",
        "alias_text":  "bioweave",
        "alias_norm":  "bioweave",
        "points_to_client_id":  "a0b82279-a391-4f1e-a8bc-e559e6246ee3",
        "points_to_canonical":  "bioweaves",
        "points_to_needs_confirmation":  false,
        "same_named_canonicals":  [
                                      {
                                          "id":  "a9902f44-3f65-485b-8765-5d7258c70e5f",
                                          "canonical_name":  "bioweave",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "5cc1c7d9-9de1-4236-9d71-8e129b7e42f8",
        "alias_text":  "nasher mile",
        "alias_norm":  "nasher mile",
        "points_to_client_id":  "5683b3fc-e060-4a97-8d88-bdee57c83010",
        "points_to_canonical":  "nasher miles",
        "points_to_needs_confirmation":  false,
        "same_named_canonicals":  [
                                      {
                                          "id":  "524c93f2-0454-4f8e-ba75-3c1fa9d73429",
                                          "canonical_name":  "nasher mile",
                                          "needs_confirmation":  true
                                      }
                                  ]
    },
    {
        "alias_id":  "95bd111a-b8d3-4c26-94b2-43fdafa1a814",
        "alias_text":  "papa don,t peach",
        "alias_norm":  "papa don,t peach",
        "points_to_client_id":  "0aa8f0d5-2060-4705-b1dd-8c2997fb26aa",
        "points_to_canonical":  "papa don\u0027t preach",
        "points_to_needs_confirmation":  false,
        "same_named_canonicals":  [
                                      {
                                          "id":  "9f07b34b-1a8d-46ec-a01c-a57412112778",
                                          "canonical_name":  "papa don,t peach",
                                          "needs_confirmation":  false
                                      }
                                  ]
    },
    {
        "alias_id":  "24c3a3ee-f7ae-4cf1-b272-12a22ee0fd58",
        "alias_text":  "papa dont peach",
        "alias_norm":  "papa dont peach",
        "points_to_client_id":  "0aa8f0d5-2060-4705-b1dd-8c2997fb26aa",
        "points_to_canonical":  "papa don\u0027t preach",
        "points_to_needs_confirmation":  false,
        "same_named_canonicals":  [
                                      {
                                          "id":  "62a9f155-4e0c-46d0-85ab-ea02c8e8315b",
                                          "canonical_name":  "papa dont peach",
                                          "needs_confirmation":  false
                                      }
                                  ]
    }
]
-- Example: safari-genie alias (e80ee6c3) points to safari (929d4094, needs_confirmation true)
-- while canonical client safari-genie (0b3b9f91, needs_confirmation false) exists with same normalized name.
-- No UPDATE/DELETE provided.
