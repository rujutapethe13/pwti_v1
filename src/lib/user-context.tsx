"use client";

import * as React from "react";

import { DEFAULT_USER_SETTINGS, initialsFromName, type MeResponse } from "@/lib/account-types";
import { getDeviceId, getDeviceLabel } from "@/lib/device-session";

/**
 * The signed-in user, fetched once and shared.
 *
 * ── Why one fetch ────────────────────────────────────────────────────────────
 * The avatar, the dropdown header, the profile page and all six settings tabs
 * need the same handful of fields. Reading them from four places would mean four
 * round trips, four chances to disagree, and four loading states. So the shell
 * fetches `/api/me` once and everything else reads it from here.
 *
 * ── Fetched once per page load, not once per mount ───────────────────────────
 * `AppShell` remounts on navigation inside the (app) group, and the workspace
 * group has its own layout. The module-level cache below is what makes "once"
 * true across both, and it also collapses a React StrictMode double-effect into
 * a single request.
 *
 * ── Failures are visible, not silent ─────────────────────────────────────────
 * A 401 means the session is gone and middleware will bounce the user to
 * /signin on the next navigation, so `error` is set and the avatar renders as a
 * signed-out placeholder rather than an invented user.
 */

export interface UserContextValue {
  user: MeResponse["user"] | null;
  settings: MeResponse["settings"];
  /** False on a database where the account migration has not been applied. */
  settingsPersisted: boolean;
  permissions: MeResponse["permissions"];
  sessions: MeResponse["sessions"];
  lastSignInAt: string | null;
  loading: boolean;
  error: string | null;
  /** Re-read from the server. */
  refresh: () => Promise<void>;
  /** Adopt a response the caller already has, so a save does not re-fetch. */
  applySnapshot: (snapshot: MeResponse) => void;
  /** Optimistically merge a partial user patch, for post-save updates. */
  patchUser: (patch: Partial<MeResponse["user"]>) => void;
}

const UserContext = React.createContext<UserContextValue | null>(null);

let cache: MeResponse | null = null;
let inflight: Promise<MeResponse> | null = null;
const subscribers = new Set<(snapshot: MeResponse) => void>();

function publish(snapshot: MeResponse) {
  subscribers.forEach((listener) => listener(snapshot));
}

async function fetchMe(): Promise<MeResponse> {
  if (cache) return cache;
  if (inflight) return inflight;

  const request = (async () => {
    const params = new URLSearchParams();
    const deviceId = getDeviceId();
    if (deviceId) {
      params.set("device_id", deviceId);
      params.set("device_label", getDeviceLabel());
    }

    const query = params.toString();
    const response = await fetch(query ? `/api/me?${query}` : "/api/me", {
      credentials: "same-origin",
    });

    if (!response.ok) {
      let message = "Could not load your account";
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        // A non-JSON error body (a proxy 502, say) keeps the default message.
      }
      throw new Error(message);
    }

    const snapshot = (await response.json()) as MeResponse;
    cache = snapshot;
    publish(snapshot);
    return snapshot;
  })();

  inflight = request;
  try {
    return await request;
  } finally {
    if (inflight === request) inflight = null;
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<MeResponse | null>(cache);
  const [loading, setLoading] = React.useState(cache === null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await fetchMe());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your account");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (cache) return;
    void load();
  }, [load]);

  // A save in a settings tab calls applySnapshot, which is how the avatar in the
  // top bar updates without the tab having to know anything about the shell.
  React.useEffect(() => {
    const listener = (next: MeResponse) => setSnapshot(next);
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }, []);

  const refresh = React.useCallback(async () => {
    cache = null;
    inflight = null;
    await load();
  }, [load]);

  const applySnapshot = React.useCallback((next: MeResponse) => {
    cache = next;
    setSnapshot(next);
  }, []);

  const patchUser = React.useCallback((patch: Partial<MeResponse["user"]>) => {
    setSnapshot((current) => {
      if (!current) return current;
      const next: MeResponse = {
        ...current,
        user: { ...current.user, ...patch },
      };
      cache = next;
      return next;
    });
  }, []);

  const value = React.useMemo<UserContextValue>(() => {
    const base = snapshot ?? {
      success: true as const,
      user: null,
      settings: DEFAULT_USER_SETTINGS,
      settingsPersisted: true,
      permissions: { canManageMembers: false },
      sessions: [],
      lastSignInAt: null,
    };

    return {
      user: base.user,
      settings: base.settings,
      settingsPersisted: base.settingsPersisted,
      permissions: base.permissions,
      sessions: base.sessions,
      lastSignInAt: base.lastSignInAt,
      loading: loading && snapshot === null,
      error,
      refresh,
      applySnapshot,
      patchUser,
    };
  }, [snapshot, loading, error, refresh, applySnapshot, patchUser]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/**
 * The current user. Safe to call outside the provider: it returns an empty
 * value rather than throwing, because several consumers render inside error
 * boundaries where a thrown context error would mask the real failure.
 */
export function useUser(): UserContextValue {
  const context = React.useContext(UserContext);
  if (context) return context;

  return {
    user: null,
    settings: DEFAULT_USER_SETTINGS,
    settingsPersisted: true,
    permissions: { canManageMembers: false },
    sessions: [],
    lastSignInAt: null,
    loading: false,
    error: null,
    refresh: async () => {},
    applySnapshot: () => {},
    patchUser: () => {},
  };
}

/** The `canManageMembers` answer on its own, for menu items and tab lists. */
export function useCanManageMembers(): boolean {
  const { permissions } = useUser();
  return permissions.canManageMembers;
}

/** Drop the cache. Only for tests and for the sign-out path. */
export function resetUserCache() {
  cache = null;
  inflight = null;
}

/**
 * The shape the rest of the app reads the user in: `name` and `role` rather
 * than `fullName` and `appRole`, plus the joined and last-login timestamps.
 *
 * It is an adapter over the same provider, not a second store — both hooks
 * observe one /api/me fetch and one cache, so a rename in the account settings
 * updates every reader at once.
 */
export function useCurrentUser(): {
  user: {
    name: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    joinedAt: string | null;
    lastLoginAt: string | null;
  } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  patchUser: (patch: { name?: string; avatarUrl?: string | null }) => void;
} {
  const { user, loading, error, refresh, patchUser, lastSignInAt } = useUser();

  return {
    user: user
      ? {
          name: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.appRole,
          joinedAt: user.joinedAt,
          lastLoginAt: lastSignInAt,
        }
      : null,
    loading,
    error,
    refresh,
    patchUser: (patch) =>
      patchUser({
        fullName: patch.name,
        avatarUrl: patch.avatarUrl,
      }),
  };
}

/**
 * Initials for an avatar fallback, from whatever name is available.
 * Falls back through the email local part to "?" so it never returns empty.
 */
export function userInitials(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const source = name?.trim() || email?.trim();
  if (!source) return "?";

  if (name?.trim()) return initialsFromName(name);

  const localPart = source.split("@")[0];
  return initialsFromName(localPart);
}