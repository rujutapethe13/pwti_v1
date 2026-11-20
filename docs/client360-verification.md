# Client 360 verification

## Implementation

`getClientAnalytics` now reads the paginated live job scope and returns KPI,
breakdown, monthly, owner, recent-job, and exclusion data. The analytics
dashboard uses that action and applies the existing board selection.

## Verification status

The live Supabase service-role diagnostics were not available in this
environment, so board names, client totals, and Levis/Hokipo KPI values could
not be truthfully recorded here. Run the existing live diagnostics after
deployment to populate those values.

`npm run check:baseline` completed with 0 new type errors. The repository
baseline currently reports 69 pre-existing test failures, including the
existing Client 360 dropdown fixture failures.
