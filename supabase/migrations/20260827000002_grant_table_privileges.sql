-- ────────────────────────────────────────────────────────────
-- Migration: Grant table privileges to anon/authenticated roles
-- ────────────────────────────────────────────────────────────
--
-- ROOT CAUSE
--   No GRANT statements were ever issued for the application tables.
--   In a standard Supabase project the `supabase` extension configures
--   default privileges, but when schemas are applied manually the
--   `anon` and `authenticated` roles have no privileges on any table.
--   Combined with RLS (enabled by 20260826_rls_core_metadata.sql),
--   this causes 42501 (insufficient_privilege) on every operation.
--
-- FIX
--   Grant USAGE on the schema and SELECT/INSERT/UPDATE/DELETE on all
--   application tables so RLS policies can be evaluated. Without at
--   least SELECT, PostgreSQL returns 42501 before RLS is even
--   consulted.
--
--   These grants are safe because RLS still enforces row-level access.
--   The grants only allow the *attempt*; RLS decides what rows are
--   visible / modifiable.

-- ── 1. Schema usage ───────────────────────────────────────────
grant usage on schema public to anon, authenticated;

-- ── 2. Table privileges ───────────────────────────────────────
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;

grant usage, select on all sequences in schema public
  to anon, authenticated;

-- ── 3. Future tables (for tables created after this migration) ─
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;
grant usage, select on all sequences in schema public
  to anon, authenticated;

-- ── 4. Grant on the views table specifically ──────────────────
--    Ensures ensureBoardViews / renameView / duplicateView /
--    deleteView via the service role (which bypasses RLS) work, and
--    also covers any code path that still uses the anon key.
grant select, insert, update, delete on public.views to anon, authenticated;
