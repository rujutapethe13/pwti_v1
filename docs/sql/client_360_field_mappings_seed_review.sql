-- STEP 2 (after CHECK extended): seed/override field mappings (label-matched preview). DO NOT RUN without review.
-- source='manual_override', ON CONFLICT (board_id, field_type) DO UPDATE
-- Org: org-1792039761662-m59i0f8
-- Notes:
-- * October 2026 client mapped to "Item Name" (fbcd211a-1bad-4b7d-bbf0-9cfd7df255be, text) per decision 5 safeguard:
--   distinct values listed below; unmatched names must go to Needs review, never auto-created.
--   October "Item Name" distinct values (9, from live cell_values 2026-11-18): Hokipo(2), Levi  Strauss & Co(1), Lotto(3), Nasher Mile(1), Papa Dont Peach(1), PGP(1), Safari(5), The Pant Project(1), Wipro(1).
-- * receive_date prefers "Receive Date Post Production" over "Inward Date" where both exist (consistent with live resolver receive_date|job_date preference).
-- * upload_date maps "Date of Upload"/"Date of upload" (present on all active non-Practice boards); mapping required for Completed (uploaded)/turnaround via field_mappings.
-- * job_status maps board Status column (not invoice status) where distinct; invoice_status mapped to invoice status column when present.
-- * All 11 active non-Practice boards included. Review each proposed column before running.

INSERT INTO public.client_360_field_mappings
  (board_id, organization_id, field_type, resolved_column_ref, source, confidence, created_at, updated_at)
VALUES
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'client', '89fc14ec-1ce6-4be2-8ac9-7228d8ea7bb2', 'manual_override', 1.00, now(), now()) -- April 2026 :: client -> Client / Company   Name (text),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'receive_date', 'df882620-9976-4d59-a070-e555f1865bd6', 'manual_override', 1.00, now(), now()) -- April 2026 :: receive_date -> Receive Date Post Production (date),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'upload_date', '9471d966-9a80-4047-af16-478ef145dcc8', 'manual_override', 1.00, now(), now()) -- April 2026 :: upload_date -> Date of Upload (date),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'job_status', '03b81b62-d4f0-495b-8b3f-18d2f7c8dcf0', 'manual_override', 1.00, now(), now()) -- April 2026 :: job_status -> Status (status),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'batch_job_id', '1d724ca0-2078-49dc-90a0-b5946329de90', 'manual_override', 1.00, now(), now()) -- April 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'sku_count', '93013d92-5803-4604-98b8-462117bf6434', 'manual_override', 1.00, now(), now()) -- April 2026 :: sku_count -> No. of SKUS (number),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'invoice_amount', '518c6cd4-c6f6-4ea0-9f1a-1a849ea9040e', 'manual_override', 1.00, now(), now()) -- April 2026 :: invoice_amount -> Invoice Amount (currency),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'invoice_status', 'b2a415b3-4801-4a6c-9ac1-3a92c7c565b3', 'manual_override', 1.00, now(), now()) -- April 2026 :: invoice_status -> Invoice  Status (status),
  ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f', 'org-1792039761662-m59i0f8', 'assignee_owner', '8eebfdaa-4f73-4930-9249-069bf03dfc26', 'manual_override', 1.00, now(), now()) -- April 2026 :: assignee_owner -> Assigned To (person),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'client', '3e7fbf76-6efe-400d-abd1-00d2304f159b', 'manual_override', 1.00, now(), now()) -- August 2026 :: client -> Client / Company   Name (text),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'receive_date', '4589abc3-a708-472d-984a-586fe82c459f', 'manual_override', 1.00, now(), now()) -- August 2026 :: receive_date -> Receive Date Post Production (date),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'upload_date', '08d9c405-e23f-45e4-a457-6c6558d3b3bb', 'manual_override', 1.00, now(), now()) -- August 2026 :: upload_date -> Date of Upload (date),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'job_status', 'f403395b-178b-477e-9a0b-3fed3f72bf01', 'manual_override', 1.00, now(), now()) -- August 2026 :: job_status -> Status (status),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'batch_job_id', '14e141eb-5f3a-4d26-ade1-69c1d343d9c2', 'manual_override', 1.00, now(), now()) -- August 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'sku_count', '16db2822-b66a-4f57-a71f-83fe53363a7d', 'manual_override', 1.00, now(), now()) -- August 2026 :: sku_count -> No. of SKUS (number),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'invoice_amount', '7ed6117e-fbcc-4204-8bff-e36999b2875a', 'manual_override', 1.00, now(), now()) -- August 2026 :: invoice_amount -> Invoice Amount (currency),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'invoice_status', '05737708-cc7d-49a5-ab34-829ba626cc0b', 'manual_override', 1.00, now(), now()) -- August 2026 :: invoice_status -> Invoice  Status (status),
  ('b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56', 'org-1792039761662-m59i0f8', 'assignee_owner', 'e3ecae6d-05cf-4798-9e5d-463ea8d07ef8', 'manual_override', 1.00, now(), now()) -- August 2026 :: assignee_owner -> Assigned To (person),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'client', '97c82647-a076-417f-955b-82c93eb86acb', 'manual_override', 1.00, now(), now()) -- February 2026 :: client -> Client / Company   Name (text),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'receive_date', 'a53cf109-28d8-4814-b44f-78bc0145f1f6', 'manual_override', 1.00, now(), now()) -- February 2026 :: receive_date -> Receive Date Post Production (date),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'upload_date', '809f34a1-2009-43e9-9786-06bb968f92f5', 'manual_override', 1.00, now(), now()) -- February 2026 :: upload_date -> Date of Upload (date),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'job_status', 'f526e5a0-d888-4ac2-9b4b-0871cde241d1', 'manual_override', 1.00, now(), now()) -- February 2026 :: job_status -> Status (status),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'batch_job_id', 'c4bd0887-24d6-4cbf-b47e-0f4784225d3d', 'manual_override', 1.00, now(), now()) -- February 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'sku_count', '3d0f1d73-56ac-4888-b550-05dd88b7de1f', 'manual_override', 1.00, now(), now()) -- February 2026 :: sku_count -> No. of SKUS (number),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'invoice_amount', 'f425d9cc-dcfb-418a-b054-3acca50e829f', 'manual_override', 1.00, now(), now()) -- February 2026 :: invoice_amount -> Invoice Amount (currency),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'invoice_status', '71c17197-1567-401c-9a77-cba21bf9a732', 'manual_override', 1.00, now(), now()) -- February 2026 :: invoice_status -> Invoice  Status (status),
  ('37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60', 'org-1792039761662-m59i0f8', 'assignee_owner', '970b8c13-5dd0-4358-8d04-b13a7619b23b', 'manual_override', 1.00, now(), now()) -- February 2026 :: assignee_owner -> Assigned To (person),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'client', '0eda7f61-ecfe-4a19-bafc-9075daac18ec', 'manual_override', 1.00, now(), now()) -- January 2026 :: client -> Client / Company   Name (text),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'receive_date', '02211ad1-94dd-439c-86a7-16978aefcdb1', 'manual_override', 1.00, now(), now()) -- January 2026 :: receive_date -> Receive Date Post Production (date),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'upload_date', 'ab266d16-cbab-4b86-bbdd-79001d5fcf7b', 'manual_override', 1.00, now(), now()) -- January 2026 :: upload_date -> Date of Upload (date),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'job_status', 'e537d506-0e5b-4817-a272-a3764e17ad1d', 'manual_override', 1.00, now(), now()) -- January 2026 :: job_status -> Status (status),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'batch_job_id', '548b6660-3359-480f-af13-0e2aed3b092e', 'manual_override', 1.00, now(), now()) -- January 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'sku_count', '9c7b7afd-30c4-441b-bab2-96b3520b8356', 'manual_override', 1.00, now(), now()) -- January 2026 :: sku_count -> No. of SKUS (number),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'invoice_amount', '39d50b26-57b7-48a8-880f-682d4c55f0cc', 'manual_override', 1.00, now(), now()) -- January 2026 :: invoice_amount -> Invoice Amount (currency),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'invoice_status', '7f1e084a-7098-40d0-bb1e-bc0953edc9c8', 'manual_override', 1.00, now(), now()) -- January 2026 :: invoice_status -> Invoice  Status (status),
  ('7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7', 'org-1792039761662-m59i0f8', 'assignee_owner', 'efe0df45-fd97-4b03-ac9e-dc6f352be20f', 'manual_override', 1.00, now(), now()) -- January 2026 :: assignee_owner -> Assigned To (person),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'client', '1592c98b-1c4f-4279-ac8c-c8886e91b640', 'manual_override', 1.00, now(), now()) -- July 2026 :: client -> Client / Company   Name (text),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'receive_date', 'ea6153fe-f415-4125-9df6-f9ecc2900772', 'manual_override', 1.00, now(), now()) -- July 2026 :: receive_date -> Receive Date Post Production (date),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'upload_date', '782dba94-d6fb-470d-905a-93799e0ff444', 'manual_override', 1.00, now(), now()) -- July 2026 :: upload_date -> Date of Upload (date),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'job_status', '6f0293b3-0567-4c87-a401-32d68f505edc', 'manual_override', 1.00, now(), now()) -- July 2026 :: job_status -> Status (status),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'batch_job_id', 'f4b71594-3b8e-41b3-945c-f34d22d7a591', 'manual_override', 1.00, now(), now()) -- July 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'sku_count', 'a6908803-069a-44dd-84ee-aa62ece84273', 'manual_override', 1.00, now(), now()) -- July 2026 :: sku_count -> No. of SKUS (number),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'invoice_amount', '4e95c089-3889-4ded-9b2d-b27c5ca1d634', 'manual_override', 1.00, now(), now()) -- July 2026 :: invoice_amount -> Invoice Amount (currency),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'invoice_status', '93be00f8-5b7d-4d1e-9ffe-951ebe5198a4', 'manual_override', 1.00, now(), now()) -- July 2026 :: invoice_status -> Invoice  Status (status),
  ('fa2a695c-4d99-47ed-8073-4208107e5817', 'org-1792039761662-m59i0f8', 'assignee_owner', 'f5c152c4-fc82-4fd4-ad50-d4a62b75ad72', 'manual_override', 1.00, now(), now()) -- July 2026 :: assignee_owner -> Assigned To (person),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'client', 'c3afbacb-ac4e-401f-bb7b-84d397945657', 'manual_override', 1.00, now(), now()) -- June 2026 :: client -> Client / Company   Name (text),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'receive_date', '2aeeeb20-fce4-4c8b-97e6-d69f1bf1b8e1', 'manual_override', 1.00, now(), now()) -- June 2026 :: receive_date -> Receive Date Post Production (date),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'upload_date', 'b97aafea-1c77-4fa6-a8a7-2549473e76c0', 'manual_override', 1.00, now(), now()) -- June 2026 :: upload_date -> Date of Upload (date),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'job_status', 'a81e6cc4-da7c-4070-9018-75e06667fb9f', 'manual_override', 1.00, now(), now()) -- June 2026 :: job_status -> Status (status),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'batch_job_id', '5d83e9ad-8037-4332-91dd-9651f188d61c', 'manual_override', 1.00, now(), now()) -- June 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'sku_count', '127a6b7b-3851-4728-a6b6-fd5079501ada', 'manual_override', 1.00, now(), now()) -- June 2026 :: sku_count -> No. of SKUS (number),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'invoice_amount', '21142bf0-2818-46a6-8caa-1706eb36bf45', 'manual_override', 1.00, now(), now()) -- June 2026 :: invoice_amount -> Invoice Amount (currency),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'invoice_status', '6faf3c4c-0950-4c97-8ba5-a9cd595dcc53', 'manual_override', 1.00, now(), now()) -- June 2026 :: invoice_status -> Invoice  Status (status),
  ('d8f06aa7-21de-4a39-8657-8ce6b49b8ff8', 'org-1792039761662-m59i0f8', 'assignee_owner', '67f8bf3a-ebc5-468d-a1cb-27f51c4306ef', 'manual_override', 1.00, now(), now()) -- June 2026 :: assignee_owner -> Assigned To (person),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'client', '19d34f28-4de2-47ca-9082-19bb7ae21888', 'manual_override', 1.00, now(), now()) -- March 2026 :: client -> Client / Company   Name (text),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'receive_date', '2eedce94-4c91-4a08-8581-3ff7e22ee469', 'manual_override', 1.00, now(), now()) -- March 2026 :: receive_date -> Receive Date Post Production (date),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'upload_date', 'f3be41aa-3882-46bf-805e-900bb9d1bd1a', 'manual_override', 1.00, now(), now()) -- March 2026 :: upload_date -> Date of Upload (date),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'job_status', '8ebd2d0f-3f97-4726-80d6-5f8b54777b9e', 'manual_override', 1.00, now(), now()) -- March 2026 :: job_status -> Status (status),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'batch_job_id', '0c5c498c-06e8-4a25-8e24-d7839575c56d', 'manual_override', 1.00, now(), now()) -- March 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'sku_count', '231c44b0-3a30-4d92-ba55-23927551382a', 'manual_override', 1.00, now(), now()) -- March 2026 :: sku_count -> No. of SKUS (number),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'invoice_amount', 'c2d8eefc-c5bf-43bc-8378-daacc499eda8', 'manual_override', 1.00, now(), now()) -- March 2026 :: invoice_amount -> Invoice Amount (currency),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'invoice_status', '354eb368-e21e-4540-aa32-7cc8d1ac7a18', 'manual_override', 1.00, now(), now()) -- March 2026 :: invoice_status -> Invoice  Status (status),
  ('c022f899-f173-4024-a42f-7bb0212bd0ab', 'org-1792039761662-m59i0f8', 'assignee_owner', '352ab2c8-7070-4c7a-996f-261115e134dd', 'manual_override', 1.00, now(), now()) -- March 2026 :: assignee_owner -> Assigned To (person),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'client', '0206d3a2-855a-4efa-a94e-8da4ab5049ba', 'manual_override', 1.00, now(), now()) -- May 2026 :: client -> Client / Company   Name (text),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'receive_date', '1e97af12-2fb4-4254-9543-00dc499c21ec', 'manual_override', 1.00, now(), now()) -- May 2026 :: receive_date -> Receive Date Post Production (date),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'upload_date', '5d93f84b-24bf-42da-9da3-70bf45ecaac5', 'manual_override', 1.00, now(), now()) -- May 2026 :: upload_date -> Date of Upload (date),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'job_status', '4fa57298-5444-44b6-984f-ec0962ad17a9', 'manual_override', 1.00, now(), now()) -- May 2026 :: job_status -> Status (status),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'batch_job_id', 'a06b262b-d38f-429a-9fee-94d029c90a50', 'manual_override', 1.00, now(), now()) -- May 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'sku_count', '48ecad29-77ad-4a5a-a20c-9fbd8ac02d9e', 'manual_override', 1.00, now(), now()) -- May 2026 :: sku_count -> No. of SKUS (number),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'invoice_amount', 'e057dfb8-bbcc-4ba9-bce3-de14272599ba', 'manual_override', 1.00, now(), now()) -- May 2026 :: invoice_amount -> Invoice Amount (currency),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'invoice_status', 'efb3aa3c-fd11-4b2b-aef8-19e785796f96', 'manual_override', 1.00, now(), now()) -- May 2026 :: invoice_status -> Invoice  Status (status),
  ('1cfca813-3231-4917-a09b-11930f4d8e01', 'org-1792039761662-m59i0f8', 'assignee_owner', 'cce17eb4-32a3-44b1-b008-a2290fc6f655', 'manual_override', 1.00, now(), now()) -- May 2026 :: assignee_owner -> Assigned To (person),
  ('4b0bd58f-ebeb-4f8d-92be-47be50033225', 'org-1792039761662-m59i0f8', 'client', '2a6e3033-95ee-4d61-bb42-fe952bfeae98', 'manual_override', 1.00, now(), now()) -- November 2026 :: client -> Client/Company Name (text),
  ('4b0bd58f-ebeb-4f8d-92be-47be50033225', 'org-1792039761662-m59i0f8', 'receive_date', '08e4e63e-d0a3-4086-84f9-f91234be9ebd', 'manual_override', 1.00, now(), now()) -- November 2026 :: receive_date -> Receive Date Post Production (date),
  ('4b0bd58f-ebeb-4f8d-92be-47be50033225', 'org-1792039761662-m59i0f8', 'upload_date', '96752bf9-0336-4fff-b0ab-3bb74c15addb', 'manual_override', 1.00, now(), now()) -- November 2026 :: upload_date -> Date of upload (date),
  ('4b0bd58f-ebeb-4f8d-92be-47be50033225', 'org-1792039761662-m59i0f8', 'job_status', 'ea9149da-19a2-4c1e-9c6b-792d23499a96', 'manual_override', 1.00, now(), now()) -- November 2026 :: job_status -> Status (status),
  ('4b0bd58f-ebeb-4f8d-92be-47be50033225', 'org-1792039761662-m59i0f8', 'batch_job_id', 'd7893930-c533-4e10-b299-6bb32ed578de', 'manual_override', 1.00, now(), now()) -- November 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('4b0bd58f-ebeb-4f8d-92be-47be50033225', 'org-1792039761662-m59i0f8', 'sku_count', '5fe447fa-b6ee-40c7-b594-81e83b89000c', 'manual_override', 1.00, now(), now()) -- November 2026 :: sku_count -> No. of SKUS (number),
  ('4b0bd58f-ebeb-4f8d-92be-47be50033225', 'org-1792039761662-m59i0f8', 'assignee_owner', '3709fe2a-a2ff-4d05-9095-47702119b275', 'manual_override', 1.00, now(), now()) -- November 2026 :: assignee_owner -> Assigned To (person),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'client', 'fbcd211a-1bad-4b7d-bbf0-9cfd7df255be', 'manual_override', 1.00, now(), now()) -- October 2026 :: client -> Item Name (text),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'receive_date', 'c96d2e65-7f2e-43f9-bb26-c4f0ce35b8c8', 'manual_override', 1.00, now(), now()) -- October 2026 :: receive_date -> Receive Date Post Production (date),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'upload_date', '5fb7a0fe-f611-428f-9e4a-5319f60f163d', 'manual_override', 1.00, now(), now()) -- October 2026 :: upload_date -> Date of Upload (date),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'job_status', '3b377abf-38f5-4261-97df-cd9c21a54338', 'manual_override', 1.00, now(), now()) -- October 2026 :: job_status -> Status (status),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'batch_job_id', 'd1c56922-fc11-4078-b6b4-fa684f64e402', 'manual_override', 1.00, now(), now()) -- October 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'sku_count', 'da5d3342-f8fb-4f95-9be3-4f7a31246ece', 'manual_override', 1.00, now(), now()) -- October 2026 :: sku_count -> No. of SKUS (number),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'invoice_amount', '041cfcb9-9bc3-4036-898c-1a0b64d66e6a', 'manual_override', 1.00, now(), now()) -- October 2026 :: invoice_amount -> Invoice Amount (currency),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'invoice_status', '12d5c37f-c709-4c89-beb0-c1926e620f72', 'manual_override', 1.00, now(), now()) -- October 2026 :: invoice_status -> Invoice  Status (status),
  ('6b128f51-981f-4486-b580-4d6e4c3c16a3', 'org-1792039761662-m59i0f8', 'assignee_owner', '9ef322a3-769e-4dff-9bba-91a5542a1367', 'manual_override', 1.00, now(), now()) -- October 2026 :: assignee_owner -> Assigned To (person),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'client', '07770caf-edc1-4fd6-80b9-ae6b01b21dbd', 'manual_override', 1.00, now(), now()) -- September 2026 :: client -> Client name (text),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'receive_date', '8810f0d4-bb54-4dc3-9fb3-974db87bae8a', 'manual_override', 1.00, now(), now()) -- September 2026 :: receive_date -> Receive Date Post Production (date),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'upload_date', '326e05af-f268-4104-aa0c-47c2e94b456a', 'manual_override', 1.00, now(), now()) -- September 2026 :: upload_date -> Date of Upload (date),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'job_status', '82018449-da5d-434a-983f-0a3747145eb3', 'manual_override', 1.00, now(), now()) -- September 2026 :: job_status -> Status (status),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'batch_job_id', '92b7ea31-68dd-4c41-a867-756245a26bf1', 'manual_override', 1.00, now(), now()) -- September 2026 :: batch_job_id -> Batch Details (PFM1_No) (text),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'sku_count', 'c5a345cb-1b1d-4de7-b897-81ac96365673', 'manual_override', 1.00, now(), now()) -- September 2026 :: sku_count -> No. of SKUS (number),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'invoice_amount', 'bd5a2817-5bdf-4d13-9f02-e8169c1e47c7', 'manual_override', 1.00, now(), now()) -- September 2026 :: invoice_amount -> Invoice Amount (currency),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'invoice_status', 'b09a794e-bd7d-4103-a11c-379c8c7f906f', 'manual_override', 1.00, now(), now()) -- September 2026 :: invoice_status -> Invoice  Status (status),
  ('b5bd1a84-47b0-4793-887b-2de1042d9d72', 'org-1792039761662-m59i0f8', 'assignee_owner', '053fc592-5281-4ef0-9274-399e8d4aedb7', 'manual_override', 1.00, now(), now()) -- September 2026 :: assignee_owner -> Assigned To (person)
ON CONFLICT (board_id, field_type) DO UPDATE SET
  resolved_column_ref = EXCLUDED.resolved_column_ref,
  source = 'manual_override',
  confidence = EXCLUDED.confidence,
  updated_at = now();

-- Verification preview
SELECT b.name AS board_name, m.field_type, m.resolved_column_ref, c.label, c.type, m.source, m.confidence
FROM public.client_360_field_mappings m
JOIN public.boards b ON b.id = m.board_id
JOIN public.columns c ON c.id = m.resolved_column_ref
WHERE m.organization_id = 'org-1792039761662-m59i0f8'
  AND m.board_id IN ('9bde082d-ed38-49b7-b4a0-b88d1496ab0f','b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56','37dfe955-3ed1-4bb4-a91d-b1c7c4f22b60','7b1a0e0e-fb7a-4f53-ae56-8b0b0d2ed8d7','fa2a695c-4d99-47ed-8073-4208107e5817','d8f06aa7-21de-4a39-8657-8ce6b49b8ff8','c022f899-f173-4024-a42f-7bb0212bd0ab','1cfca813-3231-4917-a09b-11930f4d8e01','4b0bd58f-ebeb-4f8d-92be-47be50033225','6b128f51-981f-4486-b580-4d6e4c3c16a3','b5bd1a84-47b0-4793-887b-2de1042d9d72')
ORDER BY b.name, m.field_type;
