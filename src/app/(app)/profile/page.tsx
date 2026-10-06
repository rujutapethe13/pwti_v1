"use client";

/**
 * Profile
 *
 * Everything on this page is the signed-in member's own record: no second
 * account, no demo data. It reads the same `UserProvider` cache the account
 * dropdown reads, so the name shown in the top bar and the name shown here can
 * never disagree, and a rename updates both without a refetch.
 *
 * ── What is editable and what is not ───────────────────────────────────────
 * The name goes through PATCH /api/me and the photo through the multipart
 * upload on /api/me/avatar. Both end up writing the caller's own profiles row.
 *
 * Email and password are not editable here. Both live in `auth.users`, both
 * require re-authentication, and both change who the caller is — which means
 * every permission decision in the app has to be re-derived afterwards. Password
 * lives at Settings > Account & security; email goes through Supabase's own
 * confirmation flow, which is what already enforces the re-authentication step.
 */

import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Camera,
  Check,
  Clock,
  Loader2,
  Lock,
  Mail,
  Shield,
  Building2,
  CalendarDays,
  MonitorSmartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/shared/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { useUser } from "@/lib/user-context";
import { useWorkspace } from "@/lib/workspace-context";
import { initialsFromName } from "@/lib/account-types";
import { accessRoleLabel } from "@/lib/members-types";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  client: "Client",
};

export default function ProfilePage() {
  const {
    user,
    loading,
    error,
    refresh,
    patchUser,
    sessions,
    lastSignInAt,
  } = useUser();
  const { workspaces } = useWorkspace();

  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameDirty, setNameDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [device, setDevice] = useState<string | null>(null);

  // Seed the editable field once the record arrives, without clobbering an
  // in-progress edit on every re-render.
  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName);
    setNameDirty(false);
  }, [user]);

  // The session's device is a property of this browser, not of the account
  // record, so it is read from the live agent string rather than stored.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setDevice(describeDevice(navigator.userAgent));
  }, []);

  const currentSession = sessions.find((session) => session.isCurrent) ?? null;
  const hasChanges = useMemo(() => nameDirty, [nameDirty]);

  const handleSave = async () => {
    if (!user || !hasChanges) return;

    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.error ?? "Failed to save your profile");
        return;
      }

      // Merge locally rather than refetching: the dropdown reads the same cache.
      patchUser({ fullName: json.user?.fullName ?? fullName.trim() });
      setNameDirty(false);
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to save your profile");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Photo upload goes to its own endpoint rather than through PATCH /api/me:
   * it is a multipart upload to storage, and the response also carries fresh
   * initials so the fallback avatar updates in the same paint.
   */
  const handleAvatarUpload = async (file: File | undefined) => {
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/me/avatar", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.error ?? "Could not upload the photo");
        return;
      }

      patchUser({
        avatarUrl: json.avatarUrl ?? null,
        initials: json.initials ?? user?.initials ?? "?",
      });
      toast.success("Photo updated.");
    } catch {
      toast.error("Could not upload the photo");
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setUploading(true);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not remove the photo");
        return;
      }
      patchUser({ avatarUrl: null });
    } finally {
      setUploading(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="space-y-8">
          <div className="space-y-2">
            <Skeleton.Base className="h-7 w-40" />
            <Skeleton.Base className="h-4 w-72" />
          </div>
          <Skeleton.Base className="h-40 w-full" />
          <Skeleton.Base className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <ErrorState
          variant="inline"
          title="Failed to load your profile"
          message={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Your account details and how you sign in.
          </p>
        </header>

        {/* ── Identity ─────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="relative">
                <Avatar className="size-20">
                  {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                  <AvatarFallback className="text-xl font-bold">
                    {user.initials || initialsFromName(user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <label
                  className="absolute -bottom-1 -right-1 flex size-7 cursor-pointer items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring"
                  aria-label="Upload a profile photo"
                >
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Camera className="size-3.5 text-muted-foreground" />
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(event) => {
                      void handleAvatarUpload(event.target.files?.[0]);
                      // Reset so re-picking the same file still fires onChange.
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {user.avatarUrl && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  disabled={uploading}
                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                >
                  Remove photo
                </button>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <Field
                label="Full name"
                htmlFor="profile-name"
                hint="Shown to everyone you share a board or workspace with."
              >
                <Input
                  id="profile-name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setNameDirty(true);
                  }}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </Field>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      Save changes
                    </>
                  )}
                </Button>
                {hasChanges && !saving && (
                  <span className="text-xs text-muted-foreground">
                    Unsaved changes
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Account ─────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-6 py-3.5 text-sm font-semibold text-foreground">
            Account
          </h2>
          <dl className="divide-y divide-border">
            <DetailRow icon={Mail} label="Email">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground">{user.email}</span>
                <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  <Lock className="size-2.5" aria-hidden="true" />
                  Re-authentication required
                </span>
              </span>
            </DetailRow>

            <DetailRow icon={Shield} label="Role">
              <span className="text-sm text-foreground">
                {ROLE_LABELS[user.appRole] ?? user.appRole}
                {user.accessRole && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    in this workspace: {accessRoleLabel(user.accessRole)}
                  </span>
                )}
              </span>
            </DetailRow>

            <DetailRow icon={Building2} label="Workspaces">
              {workspaces.length === 0 ? (
                <span className="text-sm text-muted-foreground">None yet</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {workspaces.map((ws) => (
                    <li
                      key={ws.id}
                      className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground"
                    >
                      {ws.name}
                    </li>
                  ))}
                </ul>
              )}
            </DetailRow>

            <DetailRow icon={CalendarDays} label="Joined">
              <span className="text-sm text-foreground">
                {user.joinedAt ? formatDate(user.joinedAt) : "Unknown"}
              </span>
            </DetailRow>

            <DetailRow icon={Clock} label="Last login">
              <span className="text-sm text-foreground">
                {lastSignInAt ? formatDate(lastSignInAt) : "This is your first session"}
              </span>
            </DetailRow>

            <DetailRow icon={MonitorSmartphone} label="This session">
              <span className="text-sm text-foreground">
                {currentSession?.deviceLabel ?? device ?? "Unknown"}
                {currentSession?.lastSeenAt && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    last seen {formatRelative(currentSession.lastSeenAt)}
                  </span>
                )}
              </span>
            </DetailRow>
          </dl>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-foreground"
      >
        {label}
      </label>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-6 py-3.5 sm:flex-row sm:items-center sm:gap-6">
      <dt className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground sm:w-44">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/** In the reader's own timezone; the server cannot know it. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return format(date, "d MMM yyyy 'at' HH:mm");
}

/** Coarse "how long ago", for the session's last-seen stamp. */
function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`;
}

/**
 * Browser and platform for this session.
 *
 * Deliberately coarse. A user-agent string is identifying data, so it is
 * reduced to the two facts a person needs to recognise their own session and
 * then discarded — the raw string is never stored or sent anywhere.
 */
function describeDevice(userAgent: string): string {
  const browsers: Array<[RegExp, string]> = [
    [/Edg\//i, "Edge"],
    [/OPR\//i, "Opera"],
    [/Firefox\//i, "Firefox"],
    [/Chrome\//i, "Chrome"],
    [/Safari\//i, "Safari"],
  ];

  const os: Array<[RegExp, string]> = [
    [/Windows NT/i, "Windows"],
    [/Mac OS X/i, "macOS"],
    [/Android/i, "Android"],
    [/(iPhone|iPad|iPod)/i, "iOS"],
    [/Linux/i, "Linux"],
  ];

  const browser = browsers.find(([re]) => re.test(userAgent))?.[1] ?? "Browser";
  const platform = os.find(([re]) => re.test(userAgent))?.[1] ?? "Unknown OS";

  return `${browser} on ${platform}`;
}