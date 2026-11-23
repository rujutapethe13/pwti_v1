-- STEP 1 (separate, run first): extend client_360_field_mappings.field_type CHECK to allow required mappings
-- Inspect existing constraint name in DB if different; drop+add as review. DO NOT RUN without review.
ALTER TABLE public.client_360_field_mappings
  DROP CONSTRAINT IF EXISTS client_360_field_mappings_field_type_check;
ALTER TABLE public.client_360_field_mappings
  ADD CONSTRAINT client_360_field_mappings_field_type_check CHECK (
    field_type IN (
      'client','job_date','receive_date','due_date','completed_date','upload_date','status','job_status',
      'job_type','volume','sku_count','image_count','batch_job_id','invoice_amount','invoice_status',
      'assignee','assignee_owner','job_name','client_name'
    )
  );
