# Powerweave Studio OS

## Access control and handover

- Access is invite-only. A new account without an invite is sent to
  `/access-required` and receives no workspace or board data.
- Workspace roles are owner/admin/member/viewer. Board access is inherited from
  the workspace unless a board restriction grants editor/viewer access.
- Invite users from **Account settings > Members & access**. Use real workspace
  IDs; never pass names such as `Main` or `Photofactory` as IDs.
- Apply Supabase migrations in filename order through the SQL Editor. Back up
  the database and every Storage bucket first. To roll back, run the matching
  `.down.sql` migration where one exists; otherwise restore the backup after
  validating the forward migration.
- Set the same intended Supabase URL and anon key in Vercel Production and
  Preview. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and never prefix it
  with `NEXT_PUBLIC_`.
- Before transfer, rotate the service-role, anon, database, Storage, and Vercel
  secrets after the company accepts the Supabase and Vercel projects. Configure
  the production site URL and auth redirect URLs for invites and password
  resets, and disable public sign-ups in Supabase Auth.

The database remains the source of truth for memberships, boards, and records.
Browser storage may cache UI state only; it must not be used to grant access.
