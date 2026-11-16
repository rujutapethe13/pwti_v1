-- Provider-neutral email integration tables.
-- Accessed only from server-side code via the Supabase service role
-- (which bypasses RLS). RLS is enabled with NO public policies so regular
-- authenticated users cannot read or write these rows.

-- Single-row store for the encrypted provider refresh token and cached
-- access token. The refresh lock is a row-level CAS-style lock
-- (refresh_locked_at) so concurrent requests never both rotate the
-- refresh token and invalidate each other.
CREATE TABLE IF NOT EXISTS public.email_provider_tokens (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider text NOT NULL DEFAULT 'gmail',
  encrypted_refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  refresh_locked_at timestamptz,
  provider_unhealthy boolean NOT NULL DEFAULT false,
  unhealthy_at timestamptz,
  unhealthy_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_provider_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- Idempotency keys for email sends: key = sha256(event + recipient +
-- submission/payload hash). Rows expire after the TTL so a genuine
-- re-send after the window can proceed.
CREATE TABLE IF NOT EXISTS public.email_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  recipient text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.email_idempotency_keys ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

CREATE INDEX IF NOT EXISTS email_idempotency_keys_key_idx
  ON public.email_idempotency_keys (key);
CREATE INDEX IF NOT EXISTS email_idempotency_keys_expires_idx
  ON public.email_idempotency_keys (expires_at);

-- Per-identifier rate-limit counters for public email endpoints.
-- identifier = ip (general) or ip:recipient (per-recipient).
CREATE TABLE IF NOT EXISTS public.email_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL UNIQUE,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

CREATE INDEX IF NOT EXISTS email_rate_limits_identifier_idx
  ON public.email_rate_limits (identifier);

-- Short-lived OAuth state for the admin connect flow (CSRF protection).
CREATE TABLE IF NOT EXISTS public.email_oauth_state (
  state text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'gmail',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_oauth_state ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.
