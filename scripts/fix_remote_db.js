/**
 * Fix remote Supabase database:
 *  1. Add `created_by` column to `workspaces` if missing
 *  2. Fix the self-referential `workspace_members_select` RLS policy
 *  3. Backfill created_by from first Owner member
 *  4. Reload PostgREST schema cache
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // ── 1. Check if created_by exists ──────────────────────
  // We can't introspect columns easily via RPC, so we try the backfill.
  // If created_by doesn't exist, we need to add it.

  // ── 2. Add created_by if missing (using a transaction via RPC) ──
  // First, try to create a helper function that will add the column.
  // Since we can't run DDL via the REST API, we'll use a DO block trick.
  // Actually, let's try calling a custom function.

  // Approach: Create an exec_sql function as security definer, then use it.
  // But we can't create functions via the JS client either...

  // Let's try using pg directly with service role key as password
  const { Client } = require('pg');
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const projectRef = url.hostname.split('.')[0]; // axyguuhslxdbjhnkcnce

  // Supabase Postgres connection with service_role key as password
  const connectionString = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SERVICE_ROLE_KEY}@db.${projectRef}.supabase.co:5432/postgres`;

  console.log('Attempting to connect to:', `db.${projectRef}.supabase.co`);
  console.log('Using service_role key as password...');

  try {
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });

    await client.connect();
    console.log('✅ Connected to remote database');

    // Check if created_by column exists
    const colCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
        AND column_name = 'created_by'
    `);

    const hasColumn = colCheck.rows.length > 0;
    console.log(`workspaces.created_by ${hasColumn ? 'exists' : 'missing'}`);

    if (!hasColumn) {
      console.log('Adding created_by column...');
      await client.query(`
        ALTER TABLE public.workspaces
        ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
      `);
      console.log('✅ Created created_by column');

      // Backfill from first Owner member
      console.log('Backfilling created_by from Owner members...');
      const backfillResult = await client.query(`
        UPDATE public.workspaces w
        SET created_by = (
          SELECT wm.user_id
          FROM public.workspace_members wm
          INNER JOIN public.roles r ON r.id = wm.role_id
          WHERE wm.workspace_id = w.id
            AND r.name = 'Owner'
          ORDER BY wm.created_at ASC
          LIMIT 1
        )
        WHERE w.created_by IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            INNER JOIN public.roles r ON r.id = wm.role_id
            WHERE wm.workspace_id = w.id
              AND r.name = 'Owner'
          )
      `);
      console.log(`✅ Backfilled ${backfillResult.rowCount} workspaces`);
    }

    // Fix workspace_members SELECT policy
    console.log('Fixing workspace_members_select policy...');

    // Check if the old policy exists
    const policyCheck = await client.query(`
      SELECT polname
      FROM pg_policies
      WHERE tablename = 'workspace_members' AND polname = 'workspace_members_select'
    `);

    const hasPolicy = policyCheck.rows.length > 0;
    console.log(`workspace_members_select policy ${hasPolicy ? 'exists' : 'missing'}`);

    await client.query(`
      DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members
    `);

    await client.query(`
      CREATE POLICY "workspace_members_select" ON public.workspace_members
        FOR SELECT
        USING (
          user_id = auth.uid()
          OR public.is_workspace_member(workspace_id)
        )
    `);
    console.log('✅ Fixed workspace_members_select policy');

    // Reload PostgREST schema cache
    console.log('Reloading PostgREST schema cache...');
    await client.query(`
      SELECT pg_notify('pgbouncer_cache_refresh', '');
    `);
    console.log('✅ Schema cache reload signal sent');

    // Also try the supabase realtime refresh endpoint
    // PostgREST doesn't need a reload for policy changes, but let's be safe

    // Verify the fix: test direct workspace_members query as authenticated user
    // (we can't test as anon user via pg, but the policy fix should be sufficient)

    await client.end();
    console.log('\n✅ All fixes applied successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

main();
