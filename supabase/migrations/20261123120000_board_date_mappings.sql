-- Migration 20261123120000: Per-board upload/receive date mapping
--
-- Problem:
--   client_360_field_mappings.field_type only allows
--   ('client', 'job_date', 'volume', 'due_date', 'status'). There is no
--   'upload_date' or 'receive_date' type, so a per-board override for the
--   Upload date or Received date column can never be persisted. The Overview
--   therefore falls back to label matching only, and a board whose upload
--   column is not named like "upload"/"deliver"/"complet" shows "No upload
--   date mapping" even when it holds upload dates. Completed (Uploaded),
--   Avg. Turnaround and the jobs table then disagree because they each guess
--   a different column (or none).
--
-- Fix:
--   Widen the field_type check constraint to also accept 'upload_date' and
--   'receive_date', plus every field_type value already present in the table.
--   Existing rows are preserved (the allow-list is built dynamically), so the
--   ALTER never fails on legacy data the way a hard-coded IN-list did:
--     ERROR 23514 ... violated by some row
--
-- This lets the Settings > Date mappings UI persist a manual_override row per
-- board, and lets live-job-scope read it back via
--   pickField(bm, "upload_date", ...) / pickField(bm, "receive_date", ...).
--
-- Safe to run once in the Supabase SQL editor. No existing data is deleted or
-- rewritten; the constraint is widened only.

DO $$
DECLARE
    v_constraint_name text;
    v_allow_list      text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'client_360_field_mappings'
    ) THEN
        raise notice '[Date mappings] client_360_field_mappings not found; skipping constraint update';
        RETURN;
    END IF;

    -- Drop any existing field_type check so we can replace it.
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.client_360_field_mappings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%field_type%';

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.client_360_field_mappings DROP CONSTRAINT %I', v_constraint_name);
    END IF;

    -- Build the allow-list as the union of:
    --   * the canonical types (including the two new ones), and
    --   * every distinct field_type already stored,
    -- so no existing row can violate the new constraint. quote_literal keeps
    -- it injection-safe even if a stored value contains a quote.
    SELECT string_agg(quote_literal(t), ', ' ORDER BY t)
    INTO v_allow_list
    FROM (
        SELECT DISTINCT field_type AS t
        FROM public.client_360_field_mappings
        WHERE field_type IS NOT NULL
        UNION
        SELECT v
        FROM unnest(ARRAY[
            'client', 'job_date', 'volume', 'due_date', 'status',
            'upload_date', 'receive_date'
        ]) AS v
    ) AS types;

    IF v_allow_list IS NULL THEN
        -- No rows and no canonical types (impossible, but guard anyway).
        v_allow_list := '''client'', ''job_date'', ''volume'', ''due_date'', ''status'', ''upload_date'', ''receive_date''';
    END IF;

    EXECUTE format(
        'ALTER TABLE public.client_360_field_mappings
             ADD CONSTRAINT client_360_field_mappings_field_type_check
             CHECK (field_type IN (%s))',
        v_allow_list
    );

    raise notice '[Date mappings] field_type check now allows: %', v_allow_list;
END;
$$;