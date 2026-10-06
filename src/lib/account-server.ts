import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/board-access";
import { getAccessSnapshot } from "@/lib/rbac";
import {
  DEFAULT_USER_SETTINGS,
  accessRoleFromAppRole,
  initialsFromName,
  resolveFullName,
  type AccessRole,
  type AccountSession,
  type AccountUser,
  type UserSettings,
} from "@/lib/account-types";

/**
 * Server-side account reader, shared by /api/me, /api/me/avatar and the
 * /profile page.
 *
 * ── Why the service role ─────────────────────────────────────────────────────
 * Every read here is scoped to a single `userId` that the caller already
 * resolved from their own session cookie, so the service key is not widening
 * anything: it is only used because `profiles`, `members` and `user_settings`
 * are not all readable by the caller's own JWT on every deployment. Writes go
 * through the same path and are likewise filtered by `userId`.
 *
 * Nothing here re-derives a permission rule. The owner / edit / view badge
 * comes from the `members` table and the pre-existing `isOwner` check, with the
 * organization-wide role only as a last resort.
 *
 * ── Tolerating an unapplied migration ────────────────────────────────────────
 * `user_settings` and `user_sessions` arrive with the account migration, which
 * is applied by hand in the Supabase dashboard. Every read of them treats an
 * error as "no data yet" and reports `settingsPersisted: false` so the UI can
 * say so rather than silently pretending a save worked.
 */

/** PostgREST's "relation does not exist", for both the SQL and schema-cache paths. */
export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "42P01" || code === "PGRST205") return true;
  const message = (error as { message?: string }).message ?? "";
  return /does not exist|not found in the schema cache/i.test(message);
}

const ROLE_STRENGTH: Record<AccessRole, number> = { owner: 3, edit: 2, view: 1 };

function strongestRole(roles: AccessRole[]): AccessRole | null {
  return roles.reduce<AccessRole | null>(
    (best, role) =>
      best === null || ROLE_STRENGTH[role] > ROLE_STRENGTH[best] ? role : best,
    null,
  );
}

/**
 * The workspace role to badge the user with.
 *
 * Order of authority: the account owner check, then the strongest active
 * `members` row this person holds anywhere, then the organization role mapped
 * onto the same vocabulary. The fallback only applies when `members` says
 * nothing at all, which is the normal state on a database where the Members
 * dialog has never been opened.
 */
async function resolveAccessRole(
  userId: string,
  appRole: AccountUser["appRole"],
): Promise<AccessRole> {
  if (await isOwner(userId)) return "owner";

  const db = await createServiceClient();
  const { data, error } = await db
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    // 42P01 on a database without the members migration, or a transient read
    // failure. Either way the fallback below is the honest answer.
    return accessRoleFromAppRole(appRole);
  }

  const roles = (data ?? [])
    .map((row) => (row.role as AccessRole | null)?.toLowerCase())
    .filter((role): role is AccessRole =>
      role === "owner" || role === "edit" || role === "view",
    );

  return strongestRole(roles) ?? accessRoleFromAppRole(appRole);
}

async function resolveOrganizationName(
  organizationId: string | null,
): Promise<string | null> {
  if (!organizationId) return null;

  const db = await createServiceClient();
  const { data } = await db
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  return data?.name ?? null;
}

interface ProfileRow {
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
}

async function readProfile(userId: string): Promise<ProfileRow | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("full_name, avatar_url, created_at, last_login_at, last_active_at")
    .eq("id", userId)
    .maybeSingle();

  return (data as ProfileRow | null) ?? null;
}

/** snake_case column -> the camelCase field on UserSettings. */
function rowToSettings(row: Record<string, unknown> | null): UserSettings {
  if (!row) return { ...DEFAULT_USER_SETTINGS };

  const boolean = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : null;

  return {
    jobTitle: text(row.job_title),
    timezone: text(row.timezone),
    language: text(row.language),
    profileVisibility:
      row.profile_visibility === "boards" || row.profile_visibility === "only_me"
        ? row.profile_visibility
        : "everyone",
    showOnlineStatus: boolean(row.show_online_status, DEFAULT_USER_SETTINGS.showOnlineStatus),
    showLastActive: boolean(row.show_last_active, DEFAULT_USER_SETTINGS.showLastActive),
    mentionsEmail: boolean(row.mentions_email, DEFAULT_USER_SETTINGS.mentionsEmail),
    mentionsInApp: boolean(row.mentions_in_app, DEFAULT_USER_SETTINGS.mentionsInApp),
    assignedEmail: boolean(row.assigned_email, DEFAULT_USER_SETTINGS.assignedEmail),
    assignedInApp: boolean(row.assigned_in_app, DEFAULT_USER_SETTINGS.assignedInApp),
    boardActivityEmail: boolean(
      row.board_activity_email,
      DEFAULT_USER_SETTINGS.boardActivityEmail,
    ),
    boardActivityInApp: boolean(
      row.board_activity_in_app,
      DEFAULT_USER_SETTINGS.boardActivityInApp,
    ),
    invitesEmail: boolean(row.invites_email, DEFAULT_USER_SETTINGS.invitesEmail),
    invitesInApp: boolean(row.invites_in_app, DEFAULT_USER_SETTINGS.invitesInApp),
  };
}

const SETTINGS_COLUMNS = [
  "job_title",
  "timezone",
  "language",
  "profile_visibility",
  "show_online_status",
  "show_last_active",
  "mentions_email",
  "mentions_in_app",
  "assigned_email",
  "assigned_in_app",
  "board_activity_email",
  "board_activity_in_app",
  "invites_email",
  "invites_in_app",
] as const;

/** Translate a settings patch into the row shape, dropping absent keys. */
export function settingsPatchToRow(
  patch: Partial<UserSettings>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  for (const column of SETTINGS_COLUMNS) {
    const key = columnToField(column);
    const value = patch[key];
    if (value !== undefined) row[column] = value;
  }

  return row;
}

function columnToField(column: (typeof SETTINGS_COLUMNS)[number]): keyof UserSettings {
  switch (column) {
    case "job_title":
      return "jobTitle";
    case "timezone":
      return "timezone";
    case "language":
      return "language";
    case "profile_visibility":
      return "profileVisibility";
    case "show_online_status":
      return "showOnlineStatus";
    case "show_last_active":
      return "showLastActive";
    case "mentions_email":
      return "mentionsEmail";
    case "mentions_in_app":
      return "mentionsInApp";
    case "assigned_email":
      return "assignedEmail";
    case "assigned_in_app":
      return "assignedInApp";
    case "board_activity_email":
      return "boardActivityEmail";
    case "board_activity_in_app":
      return "boardActivityInApp";
    case "invites_email":
      return "invitesEmail";
    case "invites_in_app":
      return "invitesInApp";
  }
}

/** Read the settings row, or the defaults when the table is not there yet. */
export async function readSettings(
  userId: string,
): Promise<{ settings: UserSettings; persisted: boolean }> {
  const db = await createServiceClient();
  const { data, error } = await db
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (!isMissingRelationError(error)) {
      console.warn("[account] user_settings read failed:", error.message);
    }
    return { settings: { ...DEFAULT_USER_SETTINGS }, persisted: false };
  }

  // maybeSingle returns null when the row does not exist yet, which is not a
  // failure: the table exists and the defaults are simply the current answer.
  return { settings: rowToSettings(data as Record<string, unknown> | null), persisted: true };
}

/** Upsert a settings patch for one user. Returns false if the table is absent. */
export async function writeSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<{ ok: boolean; missingTable: boolean }> {
  const row = settingsPatchToRow(patch);
  if (Object.keys(row).length === 0) return { ok: true, missingTable: false };

  const db = await createServiceClient();
  const { error } = await db
    .from("user_settings")
    .upsert({ user_id: userId, ...row }, { onConflict: "user_id" });

  if (error) {
    if (isMissingRelationError(error)) return { ok: false, missingTable: true };
    console.error("[account] user_settings write failed:", error.message);
    return { ok: false, missingTable: false };
  }

  return { ok: true, missingTable: false };
}

/** Write the caller's own display name and/or avatar. Never touches `role`. */
export async function writeProfile(
  userId: string,
  patch: { fullName?: string; avatarUrl?: string | null },
): Promise<{ ok: boolean }> {
  const update: Record<string, unknown> = {};

  if (patch.fullName !== undefined) update.full_name = patch.fullName;
  if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;

  if (Object.keys(update).length === 0) return { ok: true };

  const db = await createServiceClient();
  const { error } = await db
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    console.error("[account] profile write failed:", error.message);
    return { ok: false };
  }

  return { ok: true };
}

/** Sessions older than this are not worth listing. */
const SESSION_MAX_AGE_DAYS = 30;

/**
 * Record this browser as a session, then return every session we still trust.
 *
 * `deviceId` is a UUID the browser generated once. Without it the caller is a
 * first request from something that has not identified itself yet, and the list
 * is returned without being touched.
 */
export async function readSessions(
  userId: string,
  deviceId?: string | null,
  deviceLabel?: string | null,
): Promise<{ sessions: AccountSession[]; lastSignInAt: string | null }> {
  const empty = { sessions: [], lastSignInAt: null };
  if (!deviceId) return empty;

  const db = await createServiceClient();

  const { error: upsertError } = await db
    .from("user_sessions")
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        device_label: deviceLabel ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id", ignoreDuplicates: false },
    );

  if (upsertError) {
    if (isMissingRelationError(upsertError)) return empty;
    console.warn("[account] session touch failed:", upsertError.message);
    return empty;
  }

  const cutoff = new Date(Date.now() - SESSION_MAX_AGE_DAYS * 86_400_000).toISOString();

  const { data, error } = await db
    .from("user_sessions")
    .select("id, device_id, device_label, created_at, last_seen_at")
    .eq("user_id", userId)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false });

  if (error) {
    console.warn("[account] session list failed:", error.message);
    return empty;
  }

  const rows = (data ?? []) as {
    id: string;
    device_id: string;
    device_label: string | null;
    created_at: string;
    last_seen_at: string;
  }[];

  const sessions = rows.map((row) => ({
    id: row.id,
    deviceLabel: row.device_label || "Unknown device",
    isCurrent: row.device_id === deviceId,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));

  const lastSignInAt =
    rows
      .filter((row) => row.device_id !== deviceId)
      .reduce<string | null>(
        (latest, row) => (!latest || row.created_at > latest ? row.created_at : latest),
        null,
      ) ?? null;

  return { sessions, lastSignInAt };
}

/** Drop every recorded session except the one making the request. */
export async function revokeOtherSessions(
  userId: string,
  keepDeviceId: string | null,
): Promise<void> {
  const db = await createServiceClient();

  let query = db.from("user_sessions").delete().eq("user_id", userId);
  if (keepDeviceId) query = query.neq("device_id", keepDeviceId);

  const { error } = await query;

  if (error && !isMissingRelationError(error)) {
    console.warn("[account] session cleanup failed:", error.message);
  }
}

export interface AccountSnapshot {
  user: AccountUser;
  settings: UserSettings;
  settingsPersisted: boolean;
  sessions: AccountSession[];
  lastSignInAt: string | null;
}

/**
 * Everything /api/me returns, assembled from one identity resolution.
 *
 * `metadata` is the auth user's metadata, which the identity helper does not
 * carry. It is only ever used as a fallback for the display name.
 */
export async function readAccount(
  userId: string,
  options: { metadata?: Record<string, unknown> | null } = {},
): Promise<AccountSnapshot> {
  const snapshot = await getAccessSnapshot();
  const identity = snapshot.identity;

  // getAccessSnapshot resolves the same session, so a mismatch here would mean
  // the session was revoked mid-request. Fail closed rather than invent a user.
  if (!identity || identity.userId !== userId) {
    throw new Error("Session identity could not be resolved");
  }

  const [profile, organizationName, accessRole, settingsResult] = await Promise.all([
    readProfile(userId),
    resolveOrganizationName(identity.organizationId),
    resolveAccessRole(userId, identity.role),
    readSettings(userId),
  ]);

  const email = identity.email ?? "";
  const fullName = resolveFullName(profile?.full_name, options.metadata, email);

  const workspace = snapshot.workspaces.find((w) => w.type !== "personal");
  const primaryWorkspace = workspace ?? snapshot.workspaces[0];

  return {
    user: {
      id: userId,
      email,
      fullName,
      initials: initialsFromName(fullName),
      avatarUrl: profile?.avatar_url ?? null,
      appRole: identity.role,
      accessRole,
      organizationName,
      workspaceName: primaryWorkspace?.name ?? null,
      joinedAt: profile?.created_at ?? null,
      lastLoginAt: profile?.last_login_at ?? null,
      lastActiveAt: profile?.last_active_at ?? null,
      emailVerified: identity.emailVerified,
    },
    settings: settingsResult.settings,
    settingsPersisted: settingsResult.persisted,
    sessions: [],
    lastSignInAt: null,
  };
}