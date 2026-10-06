/**
 * Shared shapes for the profile / account experience.
 *
 * Kept free of `server-only` and of any Supabase import, so route handlers,
 * server components and client components all share one definition. The
 * `AccessRole` vocabulary is the one the Members & access feature already
 * established (owner / edit / view) rather than a second one invented here.
 */

import type { AccessRole } from "@/lib/members-types";

// Re-exported rather than aliased so that both spellings resolve to the one
// declaration. Several server modules import AccessRole from here instead of
// reaching into members-types directly, and two copies of this union would let
// a value from one fail to typecheck against the other.
export type { AccessRole } from "@/lib/members-types";

/**
 * Who may see this user's profile. Rendered as a radio group in
 * Settings > Privacy; the stored value is the slug, not the label.
 */
export type ProfileVisibility = "everyone" | "boards" | "only_me";

/** The four notification topics, each with an email and an in-app channel. */
export const NOTIFICATION_TOPICS = [
  "mentions",
  "assigned",
  "boardActivity",
  "invites",
] as const;

export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

/** The two delivery channels every topic has. */
export const NOTIFICATION_CHANNELS = ["email", "inApp"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * A flat settings row. Flat rather than nested so a PATCH body can carry any
 * subset of it without this module having to merge deep structures on both
 * sides of the wire.
 */
export interface UserSettings {
  jobTitle: string | null;
  timezone: string | null;
  language: string | null;
  profileVisibility: ProfileVisibility;
  showOnlineStatus: boolean;
  showLastActive: boolean;
  mentionsEmail: boolean;
  mentionsInApp: boolean;
  assignedEmail: boolean;
  assignedInApp: boolean;
  boardActivityEmail: boolean;
  boardActivityInApp: boolean;
  invitesEmail: boolean;
  invitesInApp: boolean;
}

/**
 * Defaults for every flag. Notifications are opt-in for email and on for
 * in-app, which is the least surprising starting point: a user should not miss
 * a mention inside the app just because they have never visited Settings.
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  jobTitle: null,
  timezone: null,
  language: null,
  profileVisibility: "everyone",
  showOnlineStatus: true,
  showLastActive: true,
  mentionsEmail: true,
  mentionsInApp: true,
  assignedEmail: true,
  assignedInApp: true,
  boardActivityEmail: false,
  boardActivityInApp: true,
  invitesEmail: true,
  invitesInApp: true,
};

/**
 * Timezones offered in the Profile tab. IANA names, so `Intl` can resolve them
 * on the client as well as the server.
 */
export const COMMON_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Kyiv",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Mexico_City",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
] as const;

/** Languages offered in the Profile tab, as BCP-47 tags. */
export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
  { value: "hi", label: "हिन्दी" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "zh", label: "中文" },
] as const;

export const PROFILE_VISIBILITY_OPTIONS: {
  value: ProfileVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: "everyone",
    label: "Everyone in workspace",
    description: "Any member of this workspace can open your profile.",
  },
  {
    value: "boards",
    label: "Only members of my boards",
    description: "Only people who share a board with you.",
  },
  {
    value: "only_me",
    label: "Only me",
    description: "Nobody else can open your profile.",
  },
];

/** The person behind the session, as the shell and the profile page need them. */
export interface AccountUser {
  id: string;
  email: string;
  /** Never blank: falls back through the auth metadata to the email local part. */
  fullName: string;
  /** Two-letter initials for the avatar fallback. */
  initials: string;
  avatarUrl: string | null;
  /** Organization-wide role: admin | staff | client. */
  appRole: "admin" | "staff" | "client";
  /** Workspace role, in the owner / edit / view vocabulary. Null when unassigned. */
  accessRole: AccessRole | null;
  organizationName: string | null;
  workspaceName: string | null;
  /** When the profiles row was created, i.e. when they joined. */
  joinedAt: string | null;
  /** Populated from profiles.last_login_at; null until first login after deploy. */
  lastLoginAt: string | null;
  /** Populated from profiles.last_active_at; null until first heartbeat. */
  lastActiveAt: string | null;
  emailVerified: boolean;
}

/** One row of the "active sessions" list. */
export interface AccountSession {
  id: string;
  deviceLabel: string;
  isCurrent: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface MeResponse {
  success: true;
  user: AccountUser;
  settings: UserSettings;
  /**
   * False when the settings table is absent, which is the state of a database
   * where the account migration has not been applied yet. The UI still renders
   * with defaults but must not claim a save succeeded.
   */
  settingsPersisted: boolean;
  permissions: {
    /** Owner or edit. Gates the Members & access tab and its menu entry. */
    canManageMembers: boolean;
  };
  sessions: AccountSession[];
  /** Most recent sign-in on a device other than this one. */
  lastSignInAt: string | null;
}

export type MeErrorCode =
  | "unauthenticated"
  | "invalid_body"
  | "settings_unavailable";

export interface MeErrorResponse {
  success: false;
  error: string;
  code: MeErrorCode;
}

/** Initials for the avatar fallback: first letters of the first two words. */
export function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0].slice(0, 2) || "?").toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * The display name, resolved from the least to the most authoritative source.
 * The trigger that creates a profiles row reads `name` out of the signup
 * metadata, so the same two keys cover both sign-up and OAuth.
 */
export function resolveFullName(
  profileFullName: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  email: string,
): string {
  const fromProfile = profileFullName?.trim();
  if (fromProfile) return fromProfile;

  if (metadata) {
    for (const key of ["full_name", "name", "display_name"] as const) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return email.split("@")[0] || email;
}

/** Fill every gap in a partial settings patch with the current value. */
export function mergeSettings(
  current: UserSettings,
  patch: Partial<UserSettings>,
): UserSettings {
  const next: UserSettings = { ...current };

  for (const key of Object.keys(patch) as (keyof UserSettings)[]) {
    const value = patch[key];
    if (value !== undefined) {
      // Key and value are both keyed by UserSettings. Object.assign keeps the
      // types honest instead of casting the target to an index signature, which
      // would let any key be written.
      Object.assign(next, { [key]: value });
    }
  }

  return next;
}

/**
 * Map the organization-wide role onto owner / edit / view.
 *
 * Only used when the `members` table has no row for this person — on a database
 * where the Members dialog has never been opened there is nothing better to
 * read. `admin` maps to `edit`, not `owner`: owner is a membership decision,
 * and the super admin is recognised separately by `isOwner`.
 */
export function accessRoleFromAppRole(
  role: "admin" | "staff" | "client",
): AccessRole {
  return role === "client" ? "view" : "edit";
}