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

## Email — Resend

All outgoing email is sent via the official Resend SDK
(`src/features/email-notifications/resend.ts`, `EMAIL_PROVIDER=resend`). The
legacy nodemailer Gmail/Outlook providers were removed.

### Setup

1. Add a verified domain in Resend (with Receiving enabled for inbound mail).
2. Set server-only env vars (see `.env.example`):
   - `RESEND_API_KEY`
   - `RESEND_WEBHOOK_SECRET` — signing secret from Resend dashboard > Webhooks
   - `EMAIL_FROM` — e.g. `"Power Weave Studio <hello@yourdomain.com>"`
3. Create a Resend webhook at `POST /api/webhooks/resend` subscribed to
   `email.received`.
4. Apply `supabase/migrations/20261116000000_inbound_emails.sql`.

### Webhook

`POST /api/webhooks/resend` verifies the `resend-signature` HMAC, processes
`email.received` by fetching the full message from Resend and storing it
idempotently in `inbound_emails`. The endpoint returns 200 quickly and never
crashes the request on email failure.

