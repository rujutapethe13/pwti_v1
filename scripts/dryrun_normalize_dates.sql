-- DRY RUN: Step 5 - List stored date values that fail to render as canonical ymd.
-- Run in Supabase SQL Editor. SELECT only — nothing is changed.
--
-- Finds date/timeline cell values whose stored value_text is not already a
-- canonical "yyyy-mm-dd" (or a recognized placeholder/empty). These are the
-- items whose stored date is invisible/wrong in the cell. Convert them to
-- canonical "yyyy-mm-dd" only after you approve the list.

with date_cells as (
  select cv.id as cell_id, cv.record_id, r.title as record_name, cv.column_id,
         c.label as column_label, cv.value_text as stored_value,
         c.type as column_type
  from public.cell_values cv
  join public.columns c on c.id = cv.column_id and c.deleted_at is null
  join public.records r on r.id = cv.record_id
  where c.type in ('date','timeline')
    and cv.value_text is not null
    and cv.value_text <> ''
    and lower(cv.value_text) not in
        ('dd-mm-yyyy','mm-dd-yyyy','yyyy-mm-dd','dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd')
    and not (cv.value_text ~ '^\d{4}-\d{2}-\d{2}$')
)
select cell_id, record_id, record_name, column_id, column_label, column_type, stored_value
from date_cells
order by record_name, column_label;
