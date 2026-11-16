# Email Notification Automation (Resend)

Sending is powered by the official Resend SDK. Inbound email is handled by
the Resend webhook at `POST /api/webhooks/resend`.

## Setup Steps

1. Add a verified domain in Resend and confirm "Receiving" is enabled for it.
2. Set env vars (see `.env.example`):
   - `RESEND_API_KEY` — Resend API key (server-only).
   - `RESEND_WEBHOOK_SECRET` — signing secret from Resend dashboard > Webhooks.
   - `EMAIL_FROM` — verified sender, e.g. `"Power Weave Studio <hello@yourdomain.com>"`.
3. In the Resend dashboard, create a webhook pointing to
   `https://<your-domain>/api/webhooks/resend`, subscribed to `email.received`.
4. Apply `supabase/migrations/20261116000000_inbound_emails.sql` to create the
   `inbound_emails` table (idempotent storage of received messages).

## Service layer

`src/features/email-notifications/resend.ts` exports `ResendEmailProvider`:

- `send(input)` — to/cc/bcc, reply_to, HTML + plain text, attachments, retries
  on 429/5xx with exponential backoff, logs failures, never throws.
- `handleInbound(event)` — verifies the `Resend-Signature` HMAC, fetches the
  full message via `emails.receiving.get`, stores it idempotently.

`emailService.sendPendingNotification(to, payload)` is the queue's send entry
point; the old nodemailer Gmail/Outlook providers and their dependencies were
removed.

## Webhook

`POST /api/webhooks/resend` verifies the `resend-signature` header
(`t=timestamp,v1=hmac` over `${timestamp}.${rawBody}`), ignores duplicate
deliveries via the `inbound_emails.message_id` uniqueness, and returns 200
quickly even if downstream storage fails.
