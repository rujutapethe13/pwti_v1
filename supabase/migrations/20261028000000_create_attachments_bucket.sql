-- Create the 'attachments' storage bucket for file uploads.
-- Safe to run once in the Supabase SQL editor.
-- The bucket is public-read so attachment URLs can be rendered directly in <img>, <iframe>, etc.
-- Writes are open to authenticated users (the upload endpoint validates the user server-side).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  true,
  10485760,  -- 10MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read: anyone can view attachments
drop policy if exists "attachments_public_read" on storage.objects;
create policy "attachments_public_read"
  on storage.objects for select
  using (bucket_id = 'attachments');

-- Authenticated users can upload to their own folder (<bucket>/<user_id>/...)
drop policy if exists "attachments_insert_own_folder" on storage.objects;
create policy "attachments_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own attachments
drop policy if exists "attachments_delete_own_folder" on storage.objects;
create policy "attachments_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

do $$
declare
  v_bucket text;
begin
  select id::text into v_bucket
  from storage.buckets
  where id = 'attachments';

  if v_bucket is null then
    raise warning 'attachments: FAILED -- the bucket was not created';
    return;
  end if;

  raise notice 'attachments: bucket created (public read, authenticated write, 10MB limit)';
end;
$$;