-- ────────────────────────────────────────────────────────────
-- Migration: Add settings column to views table
-- ────────────────────────────────────────────────────────────
-- The views table was created without a settings column, but the
-- application code (ViewRepository, BoardView type, ViewService)
-- expects it to store view-type-specific configuration such as
-- Kanban group-by column, divide-by settings, card fields, etc.
--
-- Without this column, all view server actions (renameView,
-- duplicateView, deleteView, ensureBoardViews) fail with:
--   "Could not find the 'settings' column of 'views' in the schema cache"
--
-- PRECEDENCE: run AFTER the views table has been created.

alter table public.views
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Backfill any existing rows that somehow have NULL settings
update public.views
  set settings = '{}'::jsonb
  where settings is null;
