-- ────────────────────────────────────────────────────────────
-- Migration: Fix roles id default & seed system roles
-- Ensures the roles table always has a UUID default and that
-- system roles can be seeded idempotently.
-- ────────────────────────────────────────────────────────────

-- Ensure the id column has a UUID default (idempotent).
alter table public.roles alter column id set default gen_random_uuid();

-- Seed system roles idempotently using explicit UUIDs so we never
-- depend on the column default during seed.
insert into public.roles (id, organization_id, name, is_system_role) values
  ('00000000-0000-0000-0000-000000000001', null, 'Owner', true),
  ('00000000-0000-0000-0000-000000000002', null, 'Administrator', true),
  ('00000000-0000-0000-0000-000000000003', null, 'Manager', true),
  ('00000000-0000-0000-0000-000000000004', null, 'Supervisor', true),
  ('00000000-0000-0000-0000-000000000005', null, 'Employee', true),
  ('00000000-0000-0000-0000-000000000006', null, 'Viewer', true)
on conflict (id) do nothing;
