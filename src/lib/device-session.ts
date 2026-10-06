"use client";

/**
 * A stable id for "this browser", used to tell one signed-in device from
 * another in the active-sessions list.
 *
 * Supabase Auth exposes no endpoint that lists a user's sessions, and its
 * access token rotates on every refresh, so neither the token nor the JWT can
 * identify a device. A UUID generated once and kept in localStorage can: it
 * survives reloads and is different in a different browser profile.
 *
 * It is not a secret and nothing is authorised from it — the server only uses
 * it to label and filter rows the caller already owns.
 */

const STORAGE_KEY = "powerweave.device-id";

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private mode with storage disabled: no id, no session row. The rest of
    // the app must not care, so this is a silent no-op rather than an error.
    return null;
  }
}

/**
 * A short human label for the sessions list, e.g. "Chrome on Windows".
 * Best effort by design — the browser does not expose a reliable platform name,
 * so an unrecognised agent is shown as-is rather than guessed at.
 */
export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";

  const agent = navigator.userAgent;
  const browser = [
    /Edg\//.test(agent) && "Edge",
    /OPR\//.test(agent) && "Opera",
    /Firefox\//.test(agent) && "Firefox",
    /Chrome\//.test(agent) && "Chrome",
    /Safari\//.test(agent) && !/Chrome/.test(agent) && "Safari",
  ].find(Boolean);

  const platform = [
    /Windows/.test(agent) && "Windows",
    /iPhone|iPad|iPod/.test(agent) && "iOS",
    /Android/.test(agent) && "Android",
    /Mac OS X/.test(agent) && "macOS",
    /Linux/.test(agent) && "Linux",
  ].find(Boolean);

  const parts = [browser, platform].filter(Boolean);
  return parts.length > 0 ? parts.join(" on ") : "Unknown device";
}