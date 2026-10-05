-- Migration: Add status_options column to groups table

alter table public.groups
  add column if not exists status_options jsonb not null default '[]'::jsonb;

alter table public.groups
  alter column color set default null;
