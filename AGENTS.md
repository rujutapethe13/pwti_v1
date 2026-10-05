# AGENTS.md

Guidance for working in this repository.

## Project

Powerweave Studio OS — a Next.js + Supabase production operating system for creative
production studios. Board data lives in `records` + `cell_values`; the Overview and
Client 360 dashboards read a materialized snapshot instead (see below).

## Commands

```bash
npm run dev        # next dev
npm run build      # next build
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
```

Tests live in `src/tests/unit/` and `src/tests/integration/`. Run a focused subset with
`npx vitest run <path>`. Integration tests mock `@/lib/supabase/server` and must not be
rewritten to assert on raw table reads when the code path is meant to use an RPC.

`npm run typecheck` currently reports **pre-existing** errors unrelated to most changes:

- `src/features/overview/actions.ts` — TS2352
- `src/features/client-360/client-360-dashboard.tsx` — TS2339 `clientId`
- `src/tests/integration/client-360-snapshot.test.ts` — TS2503 `vitestVi` namespace
- assorted errors under `src/features/boards/engine/` and `src/components/shared/`

Do not treat these as regressions. Confirm your own files are clean instead.

## Database and migrations

**Migrations in `supabase/migrations/` are applied manually through the Supabase
dashboard SQL Editor — newest file last. There is no CLI linkage.**

Specifically:

- `supabase/config.toml` does not exist and the project is not linked to the CLI.
- `supabase login` has never been run; there is no `~/.supabase/access-token`.
- The `supabase_migrations` schema **does not exist** in this database, so there is no
  migration ledger and no record of which migrations have been applied.
- Direct Postgres is unreachable: `db.axyguuhslxdbjhnkcnce.supabase.co` does not resolve.
  The pooler resolves but no database password is available.
- **Do not run `supabase db push`.** With no ledger it will attempt to replay the entire
  folder.
- **Do not run `supabase migration repair`.** It creates the ledger and records only the
  one version passed, which would falsely mark every other migration as CLI-applied and
  cause `db push` to skip them.

Every migration therefore shares the same state: applied, but unrecorded. Keep migration
files as the source of truth and apply them by hand.

Because there is no ledger, **a migration is not verified until you have run it against
the live database and seen the expected effect.** Treat "the file exists" as
insufficient.

### Applying a migration

Open the file in the dashboard SQL Editor and run it whole. Two things to know:

- The editor runs the script in a single transaction, so a failure rolls everything back
  and the file can be re-run unchanged.
- Watch the `raise notice` output, not just "Success". Blocks that swallow errors with
  `exception when others` will report success while doing nothing.

A migration that creates functions should end with notices that prove the backfill ran.

### Checking SQL before deploying

There is no local Postgres to compile against, so syntax and PL/pgSQL errors only surface
on the dashboard, one failed deploy at a time. Catch the common classes statically:

```bash
node scripts/sql_sanity.cjs supabase/migrations/<file>.sql
```

It checks dollar-quote balance, paren balance, defaulted-parameter ordering (Postgres
`42P13`), bare `ROW_COUNT` use (`42703`), and `GET DIAGNOSTICS` targets that were never
declared. All three of those came from real failed deploys of the Overview date repair.

## Verifying Overview / Client 360 changes

The Overview reads `public.client_360_daily_snapshot`, which is populated by
`refresh_client_360_snapshot()`. The board view reads `records`/`cell_values` directly, so
**a healthy board with an empty snapshot shows zero across the Overview while the board
looks full.** Check the snapshot, not the board, when Overview numbers are wrong.

```bash
node scripts/overview_date_diag.cjs   # mappings, snapshot contents, coverage
node scripts/overview_date_diag4.cjs  # detailed refresh and mapping output
```

Both read through `service_role` and therefore bypass RLS. Passing these checks does not
verify RLS behaviour for non-service clients.

Gotcha: PostgREST silently truncates results at `max-rows` (1000). Any count that matters
must be measured with `Prefer: count=exact`, and diagnostics must target the organization
that actually holds records — seeded demo organizations exist with none.

## Overview data model notes

- Date columns are detected only if typed `date` or `timeline`. A *text* column labelled
  "Receive Date" is never eligible to be the received date.
- A date column is only eligible as `job_date` if it actually holds parseable dates.
  Candidates rank by populated cell count first, label hint second, so a near-empty hinted
  column cannot shadow a full one.
- `_client_360_parse_date` must never raise; impossible calendar dates such as `31 Feb`
  return NULL. An unparseable row is skipped, never fatal.
- Changing an RPC's argument list creates an overload rather than replacing the old
  function, and PostgREST keeps exposing both. `create or replace` with a new signature
  must be paired with an explicit `drop function if exists <old signature>;`.