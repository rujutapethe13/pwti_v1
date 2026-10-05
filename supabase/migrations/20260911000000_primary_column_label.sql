-- Add primary_column_label to boards table for persisting the
-- record-title (first column) header label.
alter table public.boards add column if not exists primary_column_label text;

-- Backfill existing boards with a default label
update public.boards
set primary_column_label = 'Name'
where primary_column_label is null;
