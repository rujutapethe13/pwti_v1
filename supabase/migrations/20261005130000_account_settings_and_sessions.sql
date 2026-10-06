-- Account settings, active sessions and avatar uploads.
--
-- Scope
--   Three additive objects, none of which touches the existing board model:
--     1. public.user_settings  — one row per person: job title, timezone,
--                                language, profile visibility and the eight
--                                notification flags.
--     2. public.user_sessions  — one row per browser a person has signed in
--                                from, so "active sessions" and "last login"
--                                have somewhere to be read from. Supabase Auth
--                                has no endpoint that lists a user's sessions,
--                                so they cannot be derived from the JWT.
--     3. storage bucket `avatars` — profile photos, one folder per user id.
--
-- Why the session table is keyed on a device id
--   The Supabase access token rotates on every refresh, so hashing the token
--   would file a new row on each refresh and the list would grow without bound.
--   The device id is a UUID the browser generates once and keeps in
--   localStorage, which is stable for the lifetime of that browser profile.
--   Revocation is still done by the database, not by this table:
--   `auth.admin.signOut(userId, 'others')` / the client's
--   `signOut({ scope: 'others' })` revokes the real refresh tokens. This table
--   only describes what we last saw, and 'Sign out of other devices' deletes
--   the rows it no longer trusts.
--
-- RLS
--   Every row is scoped to its own user_id. The application writes through the
--   service role (see src/app/api/me/route.ts, which scopes the write to the
--   id it resolved from the session cookie), so these policies are defence in
--   depth for the browser path rather than the primary control.
--
-- Idempotent: safe to re-run whole.

-- ─────────────────────────────────────────────────────────────────────────────
-- user_settings
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Profile tab
  job_title text,
  timezone text,
  language text,

  -- Privacy tab
  profile_visibility text not null default 'everyone'
    check (profile_visibility in ('everyone', 'boards', 'only_me')),
  show_online_status boolean not null default true,
  show_last_active boolean not null default true,

  -- Notifications tab. Two channels per topic.
  mentions_email boolean not null default true,
  mentions_in_app boolean not null default true,
  assigned_email boolean not null default true,
  assigned_in_app boolean not null default true,
  board_activity_email boolean not null default false,
  board_activity_in_app boolean not null default true,
  invites_email boolean not null default true,
  invites_in_app boolean not null default true,

  updated_at timestamptz not null default now()
);

comment on table public.user_settings is
  'Per-user account preferences. One row per auth.users id, created lazily on first read/write.';

-- ─────────────────────────────────────────────────────────────────────────────
-- user_sessions
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Stable per browser profile; see the header note on why this is not a token.
  device_id text not null,
  -- Human label such as "Chrome on Windows", shown in the sessions list.
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists user_sessions_user_device_key
  on public.user_sessions (user_id, device_id);

create index if not exists user_sessions_user_id_idx
  on public.user_sessions (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_user_settings_updated_at on public.user_settings;
create trigger touch_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — self only, with the service-role bypass every other policy uses.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_settings enable row level security;
alter table public.user_sessions enable row level security;

drop policy if exists "user_settings_select_self" on public.user_settings;
create policy "user_settings_select_self"
  on public.user_settings for select
  using (public.is_service_role() or user_id = auth.uid());

drop policy if exists "user_settings_insert_self" on public.user_settings;
create policy "user_settings_insert_self"
  on public.user_settings for insert
  with check (public.is_service_role() or user_id = auth.uid());

drop policy if exists "user_settings_update_self" on public.user_settings;
create policy "user_settings_update_self"
  on public.user_settings for update
  using (public.is_service_role() or user_id = auth.uid())
  with check (public.is_service_role() or user_id = auth.uid());

drop policy if exists "user_settings_delete_self" on public.user_settings;
create policy "user_settings_delete_self"
  on public.user_settings for delete
  using (public.is_service_role() or user_id = auth.uid());

drop policy if exists "user_sessions_select_self" on public.user_sessions;
create policy "user_sessions_select_self"
  on public.user_sessions for select
  using (public.is_service_role() or user_id = auth.uid());

drop policy if exists "user_sessions_insert_self" on public.user_sessions;
create policy "user_sessions_insert_self"
  on public.user_sessions for insert
  with check (public.is_service_role() or user_id = auth.uid());

drop policy if exists "user_sessions_update_self" on public.user_sessions;
create policy "user_sessions_update_self"
  on public.user_sessions for update
  using (public.is_service_role() or user_id = auth.uid())
  with check (public.is_service_role() or user_id = auth.uid());

drop policy if exists "user_sessions_delete_self" on public.user_sessions;
create policy "user_sessions_delete_self"
  on public.user_sessions for delete
  using (public.is_service_role() or user_id = auth.uid());

grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.user_sessions to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Avatar storage
--
-- One folder per user id: `avatars/<user_id>/<uuid>.<ext>`. The bucket is
-- public-read because the avatar is rendered in <img> tags across the app and
-- a signed URL would have to be threaded through every one of them; writes stay
-- closed to the owner of the folder.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- storage.foldername(name) splits a path into its segments, so [1] is the user
-- id. Without that check any signed-in user could write into anyone's folder.
drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill
--
-- Seed a settings row for every existing profile so the read path never has to
-- distinguish "no preferences yet" from "defaults". Rows are still created on
-- demand by the API, which upserts.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.user_settings (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

-- Verification. RAISE NOTICE is PL/pgSQL, so it needs a DO block to run at the
-- top level -- a bare `raise notice` after a DDL statement is a 42601.
do $$
declare
  v_settings integer;
  v_sessions  integer;
  v_bucket    text;
begin
  select count(*) into v_settings from public.user_settings;
  select count(*) into v_sessions from public.user_sessions;

  select id::text into v_bucket
  from storage.buckets
  where id = 'avatars';

  if v_bucket is null then
    raise warning 'account: FAILED -- the avatars storage bucket was not created';
    return;
  end if;

  if pg_get_functiondef('public.touch_updated_at()'::regprocedure) is null then
    raise warning 'account: FAILED -- touch_updated_at() was not created';
    return;
  end if;

  raise notice 'account: user_settings present, % row(s) backfilled', v_settings;
  raise notice 'account: user_sessions present, % row(s) so far', v_sessions;
  raise notice 'account: avatars bucket created (public read, owner-only write)';
  raise notice 'account: RLS enabled on both tables; every policy is self-scoped';
end;
$$;