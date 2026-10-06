import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  readAccount,
  readSessions,
  writeProfile,
  writeSettings,
} from "@/lib/account-server";
import type { MeErrorResponse, MeResponse, UserSettings } from "@/lib/account-types";

/**
 * GET  /api/me   — the signed-in user, their settings, permissions and sessions.
 * PATCH /api/me  — update their own profile fields and/or settings.
 *
 * This is the single source the avatar menu, the profile page and the settings
 * tabs all read from. It is fetched once per app load and cached in
 * UserProvider, so a second reader never makes a second round trip.
 *
 * The caller is always resolved from the session cookie. Nothing in the request
 * body is trusted as an identity, and every write is filtered by that id, so
 * this endpoint cannot be used to edit somebody else's account.
 */

/** Reject a timezone the runtime cannot resolve, so the stored value is real. */
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const profileSchema = z.object({
  // Empty is normalised to null so "clear my job title" is expressible.
  fullName: z.string().trim().max(120).optional(),
  avatarUrl: z.string().trim().url().max(600).nullable().optional(),
});

const settingsSchema = z.object({
  jobTitle: optionalText(120),
  timezone: optionalText(64),
  language: optionalText(16),
  profileVisibility: z.enum(["everyone", "boards", "only_me"]).optional(),
  showOnlineStatus: z.boolean().optional(),
  showLastActive: z.boolean().optional(),
  mentionsEmail: z.boolean().optional(),
  mentionsInApp: z.boolean().optional(),
  assignedEmail: z.boolean().optional(),
  assignedInApp: z.boolean().optional(),
  boardActivityEmail: z.boolean().optional(),
  boardActivityInApp: z.boolean().optional(),
  invitesEmail: z.boolean().optional(),
  invitesInApp: z.boolean().optional(),
});

const patchSchema = z.object({
  profile: profileSchema.optional(),
  settings: settingsSchema.optional(),
});

function fail(
  error: string,
  status: number,
  code: MeErrorResponse["code"],
) {
  return NextResponse.json({ success: false, error, code }, { status });
}

/** The authenticated user id, or null. Shared by both verbs. */
async function currentUserId(): Promise<string | null> {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return fail("Authentication required", 401, "unauthenticated");

  const params = new URL(request.url).searchParams;
  const deviceId = params.get("device_id");
  const deviceLabel = params.get("device_label");

  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const metadata = (user?.user_metadata ?? null) as Record<string, unknown> | null;

  const account = await readAccount(userId, { metadata });
  const { sessions, lastSignInAt } = await readSessions(userId, deviceId, deviceLabel);

  const payload: MeResponse = {
    success: true,
    user: account.user,
    settings: account.settings,
    settingsPersisted: account.settingsPersisted,
    permissions: {
      canManageMembers:
        account.user.accessRole === "owner" || account.user.accessRole === "edit",
    },
    sessions,
    lastSignInAt,
  };

  return NextResponse.json(payload);
}

export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return fail("Authentication required", 401, "unauthenticated");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Request body must be JSON", 400, "invalid_body");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "Invalid request", 400, "invalid_body");
  }

  const { profile, settings } = parsed.data;

  const profilePatch: { fullName?: string; avatarUrl?: string | null } = {};
  if (profile?.fullName !== undefined) {
    // A blank name is not representable: the header needs something to show, so
    // it falls back to the email local part on the next read.
    const trimmed = profile.fullName.trim();
    if (trimmed) profilePatch.fullName = trimmed;
  }
  if (profile?.avatarUrl !== undefined) {
    profilePatch.avatarUrl = emptyToNull(profile.avatarUrl) ?? null;
  }

  if (Object.keys(profilePatch).length > 0) {
    const written = await writeProfile(userId, profilePatch);
    if (!written.ok) return fail("Could not save your profile", 500, "invalid_body");
  }

  let normalizedSettings: Partial<UserSettings> | null = null;
  if (settings) {
    normalizedSettings = { ...settings } as Partial<UserSettings>;
    if (settings.jobTitle !== undefined) {
      normalizedSettings.jobTitle = emptyToNull(settings.jobTitle) ?? null;
    }
    if (settings.language !== undefined) {
      normalizedSettings.language = emptyToNull(settings.language) ?? null;
    }
    if (settings.timezone !== undefined) {
      const timezone = emptyToNull(settings.timezone) ?? null;
      if (timezone !== null && !isValidTimeZone(timezone)) {
        return fail("Unknown timezone", 400, "invalid_body");
      }
      normalizedSettings.timezone = timezone;
    }

    const written = await writeSettings(userId, normalizedSettings);
    if (!written.ok) {
      if (written.missingTable) {
        return fail(
          "Account settings are not available on this database yet. Apply supabase/migrations/20261005130000_account_settings_and_sessions.sql and try again.",
          503,
          "settings_unavailable",
        );
      }
      return fail("Could not save your settings", 500, "invalid_body");
    }
  }

  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const metadata = (user?.user_metadata ?? null) as Record<string, unknown> | null;

  const account = await readAccount(userId, { metadata });

  const payload: MeResponse = {
    success: true,
    user: account.user,
    settings: account.settings,
    settingsPersisted: account.settingsPersisted,
    permissions: {
      canManageMembers:
        account.user.accessRole === "owner" || account.user.accessRole === "edit",
    },
    sessions: [],
    lastSignInAt: null,
  };

  return NextResponse.json(payload);
}