-- Title column label becomes its own field on boards and groups.
--
-- The pinned first column of a board table is the record-title column. Its
-- header label used to be read from `boards.primary_column_label`, a single
-- board-level field that had nothing to do with the file column the user
-- picked in the import wizard's "Title column" dropdown. Worse, deleting the
-- structural "name" column promoted an arbitrary remaining text column to
-- be the title column and persisted THAT column's label, so a board ended
-- up with a header reading "Batch Details (PFM1_No)" while the column
-- actually held client names.
--
-- The label now lives in its own column on both the board and the group, is
-- never derived from `columns[0]`, and is written by the import wizard from
-- the file column the user chose.

alter table public.boards
  add column if not exists title_column_label text default 'Client / Company Name';

alter table public.groups
  add column if not exists title_column_label text default 'Client / Company Name';

-- Backfill: boards and groups that predate this field get the default label.
update public.boards
   set title_column_label = 'Client / Company Name'
 where title_column_label is null or btrim(title_column_label) = '';

update public.groups
   set title_column_label = 'Client / Company Name'
 where title_column_label is null or btrim(title_column_label) = '';

-- `primary_column_label` is the legacy board-level field. Keep it aligned
-- with the new field so older readers (export, board settings) never show a
-- stale label that used to leak an unrelated column's name.
update public.boards
   set primary_column_label = title_column_label
 where primary_column_label is distinct from title_column_label;

DO $$ BEGIN
  RAISE NOTICE 'title column label: % board(s) and % group(s) carry title_column_label',
    (SELECT count(*) FROM public.boards WHERE title_column_label IS NOT NULL),
    (SELECT count(*) FROM public.groups WHERE title_column_label IS NOT NULL);
END $$;
