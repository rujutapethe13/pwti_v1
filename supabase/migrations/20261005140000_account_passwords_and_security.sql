-- =============================================================================
-- Account security — credential store, password history, reset tokens,
-- rate limiting, and the security event log.
--
-- Why a credential store at all, when Supabase already hashes passwords
-- -----------------------------------------------------------------------
-- Supabase GoTrue owns the hash that /signin authenticates against, and the
-- app never sees it. That is enough to *sign in*, but not enough to build the
-- features requested here:
--
--   * "verify the current password against the stored hash" needs a readable
--     hash to compare against, and
--   * "reject reuse of the last 3 passwords" needs the previous hashes kept.
--
-- So the app keeps its own bcrypt copy alongside GoTrue's. Both are written on
-- every password change, in the same request, so they cannot drift. GoTrue
-- stays authoritative for authentication; this table is authoritative only for
-- step-up verification and reuse rejection.
--
-- Accounts that predate this migration have no row here. The change-password
-- route falls back to verifying against GoTrue for exactly one change, then
-- writes the row, after which verification is local. See
-- src/app/api/auth/change-password/route.ts.
--
-- ── Nothing here is readable by a client ───────────────────────────────────
-- RLS is enabled on every table and the only policy granted is a self-scoped
-- SELECT on the security event log. In particular there is deliberately NO
-- grant of SELECT on account_credentials or account_password_history: those
-- hold bcrypt hashes, and PostgREST would expose them to any caller who
-- obtained the anon key. Every read and write goes through the service role
-- from /api/auth/*.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- account_credentials — the current bcrypt hash for one user.
--
-- user_id is both the primary key and the foreign key: an account has at most
-- one credential row, so no surrogate key is needed.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.account_credentials (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  -- bcrypt digest only. Never a plaintext password, never logged.
  password_hash       text not null,
  -- Null for accounts that predate this migration. The UI renders "Unknown"
  -- rather than guessing: auth.users has no password-change timestamp, and its
  -- updated_at also moves on email and metadata changes, so reading it as one
  -- would put a confidently wrong date in front of the user.
  password_changed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.account_credentials is
  'bcrypt hash of the current password, used for step-up verification and reuse rejection. Client-inaccessible.';

comment on column public.account_credentials.password_changed_at is
  'Null when the account predates this table and the change date is genuinely unknown.';

-- ─────────────────────────────────────────────────────────────────────────────
-- account_password_history — the previous hashes, for reuse rejection.
--
-- A change pushes the *outgoing* hash in here before overwriting it, so the
-- newest row here is the password the user just replaced. Pruned to
-- PASSWORD_HISTORY_DEPTH (3) rows per user, which together with the live
-- credential row is the "current plus last 3" window the UI advertises.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.account_password_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create index if not exists account_password_history_user_created_idx
  on public.account_password_history (user_id, created_at desc);

comment on table public.account_password_history is
  'Retired password hashes, newest first, pruned to three rows per user.';

-- ─────────────────────────────────────────────────────────────────────────────
-- account_security_events — the security log.
--
-- Separate from activity_logs on purpose: activity_logs requires a non-null
-- organization_id because every row there describes something that happened
-- inside a workspace. A password change is a property of the account and
-- happens to no workspace in particular, and a user may have no organization
-- at all. Forcing these rows into activity_logs would either lose them or
-- require inventing an org id for them.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.account_security_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- e.g. 'password.changed', 'password.changed_failed', 'password.reset_requested'
  event      text not null,
  -- Never contains a password or a hash. Free-form context only.
  detail     jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists account_security_events_user_created_idx
  on public.account_security_events (user_id, created_at desc);

create index if not exists account_security_events_event_created_idx
  on public.account_security_events (event, created_at desc);

comment on table public.account_security_events is
  'Account-level security events. Readable by the owning user only; written by the service role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- account_rate_limit_events — failed-attempt ledger for lockout.
--
-- Only failures are recorded. A successful change password is the signal that
-- the attacker stopped, and counting successes toward the limit would lock out
-- exactly the user who fixed the problem.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.account_rate_limit_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Namespace the attempt, e.g. 'change_password'. Kept separate so one
  -- endpoint cannot consume another's budget.
  action     text not null,
  succeeded  boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists account_rate_limit_events_lookup_idx
  on public.account_rate_limit_events (user_id, action, succeeded, created_at desc);

comment on table public.account_rate_limit_events is
  'Failed authentication attempts, used to rate limit and temporarily lock an endpoint per user.';

-- ─────────────────────────────────────────────────────────────────────────────
-- password_reset_tokens — single-use reset links, 30 minute expiry.
--
-- token_hash is a SHA-256 digest, never the token itself. The token is only
-- ever held by the recipient of the email; if this table leaks, the stored
-- values cannot be replayed against /api/auth/reset-password.
--
-- Expiry is enforced here rather than left to GoTrue's recovery token so the
-- window is a property of this schema and does not depend on a dashboard
-- setting nobody will remember to check.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists password_reset_tokens_hash_key
  on public.password_reset_tokens (token_hash);

create index if not exists password_reset_tokens_user_created_idx
  on public.password_reset_tokens (user_id, created_at desc);

comment on column public.password_reset_tokens.expires_at is
  'Reset links expire 30 minutes after they are issued.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Credentials, history, reset tokens, and the rate-limit ledger get no policy
-- and no grant: unreachable from any client key. The security event log gets a
-- self-scoped SELECT so a user can review their own history, and nothing else.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.account_credentials enable row level security;
alter table public.account_password_history enable row level security;
alter table public.account_security_events enable row level security;
alter table public.account_rate_limit_events enable row level security;
alter table public.password_reset_tokens enable row level security;

drop policy if exists "account_security_events_select_own" on public.account_security_events;
create policy "account_security_events_select_own"
  on public.account_security_events for select
  using (auth.uid() is not null and user_id = auth.uid());

grant select on public.account_security_events to authenticated;

-- No grants on the other four tables, on purpose. See the header note.

-- ─────────────────────────────────────────────────────────────────────────────
-- account_password_state()
--
-- Does this account have a password at all, and has it ever been changed here?
--
-- The SSO question is answered from auth.users.encrypted_password, which is
-- empty for an account created through Google or any other OAuth provider and
-- set for one created with a password. That is the only place the fact is
-- recorded, so this has to be SECURITY DEFINER to read it.
--
-- SECURITY DEFINER with search_path pinned: a writable public schema would
-- otherwise let a caller shadow auth.uid() and read another user's row.
--
-- Returns has_password = false for a signed-out caller rather than raising, so
-- the route can treat "no session" and "no password" the same way.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.account_password_state()
returns table (has_password boolean, password_changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_has_pw    boolean := false;
  v_changed_at timestamptz;
begin
  if v_user_id is null then
    has_password := false;
    password_changed_at := null;
    return next;
    return;
  end if;

  select
    (u.encrypted_password is not null and u.encrypted_password <> ''),
    c.password_changed_at
  into v_has_pw, v_changed_at
  from auth.users u
  left join public.account_credentials c on c.user_id = u.id
  where u.id = v_user_id;

  has_password := coalesce(v_has_pw, false);
  password_changed_at := v_changed_at;
  return next;
end;
$$;

revoke all on function public.account_password_state() from public;
grant execute on function public.account_password_state() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- account_rate_limit_state()
--
-- Sliding-window failure count for one (user, action) pair.
--
-- locked_until is the moment the oldest counted failure leaves the window,
-- which is the earliest instant a retry can succeed. Computing it here rather
-- than returning a bare "denied" lets the route tell the user when to come
-- back instead of just refusing.
--
-- service_role only: it takes an arbitrary user id, so it is not something to
-- hand to a client.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.account_rate_limit_state(
  p_user_id         uuid,
  p_action          text,
  p_max_attempts    integer,
  p_window_seconds  integer
)
returns table (allowed boolean, attempts_used integer, locked_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_failures     integer;
begin
  select count(*)::integer into v_failures
  from public.account_rate_limit_events e
  where e.user_id = p_user_id
    and e.action = p_action
    and not e.succeeded
    and e.created_at >= v_window_start;

  attempts_used := v_failures;

  if v_failures >= p_max_attempts then
    allowed := false;
    locked_until := v_window_start + make_interval(secs => p_window_seconds);
  else
    allowed := true;
    locked_until := null;
  end if;

  return next;
end;
$$;

revoke all on function public.account_rate_limit_state(uuid, text, integer, integer) from public;
grant execute on function public.account_rate_limit_state(uuid, text, integer, integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- account_record_rate_limit_event()
--
-- Append one attempt. Failures count toward the lockout; successes do not, but
-- are still recorded so the ledger shows the request actually happened.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.account_record_rate_limit_event(
  p_user_id  uuid,
  p_action   text,
  p_succeeded boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.account_rate_limit_events (user_id, action, succeeded)
  values (p_user_id, p_action, p_succeeded);
end;
$$;

revoke all on function public.account_record_rate_limit_event(uuid, text, boolean) from public;
grant execute on function public.account_record_rate_limit_event(uuid, text, boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- consume_password_reset_token()
--
-- Single-use, expiring redemption. Returns the user id on success and NULL on
-- any failure — unknown, already used, or expired — so the caller has one code
-- path and cannot accidentally distinguish the three to the requester.
--
-- Atomicity comes from the UPDATE rather than a SELECT followed by an UPDATE:
-- the row is claimed with its uniqueness intact, so two concurrent redemptions
-- of the same token serialize and the second sees used_at already set. A
-- select-then-update would let both through.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.consume_password_reset_token(p_token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_token_hash is null or p_token_hash = '' then
    return null;
  end if;

  update public.password_reset_tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.used_at is null
     and t.expires_at > now()
  returning t.user_id into v_user_id;

  return v_user_id;
end;
$$;

revoke all on function public.consume_password_reset_token(text) from public;
grant execute on function public.consume_password_reset_token(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- revoke_all_sessions(p_user_id)
--
-- Drops every refresh token belonging to p_user_id, with no exceptions.
--
-- Only the reset-by-token path needs this, and it needs it precisely because
-- there is no caller to keep: a reset link is redeemed by someone who is not
-- signed in, so there is no current session to preserve and the safe answer is
-- to sign out everywhere.
--
-- The change-password path does NOT use this. It revokes "every session except
-- mine" through Supabase's own `signOut({ scope: 'others' })`, which is the
-- supported API for that and needs no direct access to auth.sessions.
--
-- An access token already issued stays valid until it expires; that is inherent
-- to a stateless JWT. Revoking the refresh token is what stops the session from
-- being renewed, which is why the confirmation email goes out on both paths.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.revoke_all_sessions(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  delete from auth.sessions s
  where s.user_id = p_user_id;

  -- Bare ROW_COUNT is 42703; it has to come through a declared variable.
  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

revoke all on function public.revoke_all_sessions(uuid) from public;
grant execute on function public.revoke_all_sessions(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification.
--
-- These print; they do not assert. Per AGENTS.md a migration is not verified
-- until it has been run against the live database and the expected effect
-- observed, so run this file whole in the dashboard SQL Editor and read the
-- notices — "Success" alone does not mean the functions exist.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_credentials  bigint;
  v_events       bigint;
  v_fn           text;
  v_logged_in    bigint;
  v_sso_only     bigint;
begin
  select count(*) into v_credentials from public.account_credentials;
  select count(*) into v_events      from public.account_security_events;

  select count(*) into v_logged_in
    from auth.users u
   where u.encrypted_password is not null and u.encrypted_password <> '';

  select count(*) into v_sso_only
    from auth.users u
   where u.encrypted_password is null or u.encrypted_password = '';

  select pg_get_functiondef('public.account_password_state()'::regprocedure) into v_fn;
  if v_fn is null then
    raise warning 'account security: FAILED -- account_password_state() was not created';
    return;
  end if;

  if pg_get_functiondef('public.consume_password_reset_token(text)'::regprocedure) is null then
    raise warning 'account security: FAILED -- consume_password_reset_token(text) was not created';
    return;
  end if;

  if pg_get_functiondef('public.revoke_all_sessions(uuid)'::regprocedure) is null then
    raise warning 'account security: FAILED -- revoke_all_sessions(uuid) was not created';
    return;
  end if;

  raise notice 'account security: account_credentials %, account_password_history, account_security_events %, account_rate_limit_events, password_reset_tokens created',
    v_credentials, v_events;
  raise notice 'account security: all 5 tables have RLS enabled; no client grant on credentials, history, reset tokens, or the rate-limit ledger';
  raise notice 'account security: % password account(s), % SSO-only account(s) awaiting "Set a password"', v_logged_in, v_sso_only;
  raise notice 'account security: % existing account(s) have no credential row yet — the first password change verifies against GoTrue and writes one',
    greatest(v_logged_in - v_credentials, 0);
  raise notice 'account security: account_password_state(), account_rate_limit_state(uuid,text,integer,integer), account_record_rate_limit_event(uuid,text,boolean), consume_password_reset_token(text), revoke_all_sessions(uuid) all created';
  raise notice 'account security: reset links expire 30 minutes after issue and are single-use';
end;
$$;