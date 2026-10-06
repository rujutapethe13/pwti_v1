"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MonitorSmartphone, ShieldCheck, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SaveBar } from "@/app/(app)/account/settings/_save-bar";
import { type UserSettings } from "@/lib/account-types";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";

const EMPTY_SETTINGS: UserSettings = {
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

export default function SecuritySettingsPage() {
  const { user, settings, refresh, patchUser } = useUser();
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; deviceLabel: string; isCurrent: boolean; lastSeenAt: string }[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);

  const currentSettings = user ? { ...settings } : EMPTY_SETTINGS;

  const [form, setForm] = useState(currentSettings);

  const isDirty =
    form.showOnlineStatus !== currentSettings.showOnlineStatus ||
    form.showLastActive !== currentSettings.showLastActive;

  const update = (patch: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (form.showOnlineStatus !== currentSettings.showOnlineStatus) {
        patch.showOnlineStatus = form.showOnlineStatus;
      }
      if (form.showLastActive !== currentSettings.showLastActive) {
        patch.showLastActive = form.showLastActive;
      }
      if (Object.keys(patch).length === 0) return;

      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: patch }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not save your security settings");
      }

      toast.success("Security settings saved.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save your security settings");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setLoadingSessions(true);
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadSessions() {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      const json = (await res.json()) as {
        success: boolean;
        sessions?: { id: string; deviceLabel: string; isCurrent: boolean; lastSeenAt: string }[];
      };
      if (json.success && json.sessions) {
        setSessions(json.sessions);
      }
    } catch {
      // best-effort list
    } finally {
      setLoadingSessions(false);
    }
  }

  const handleRevokeOthers = async () => {
    if (!user || revoking) return;
    setRevoking(true);
    try {
      const res = await fetch("/api/me/sessions/revoke-others", {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not sign out other devices");
      }
      await loadSessions();
      toast.success("Other devices signed out.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not sign out other devices");
    } finally {
      setRevoking(false);
      setRevokeOpen(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Sign in to manage your security.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account &amp; security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your password, sessions and presence.
        </p>
      </div>

      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-xl border-border p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Password</p>
                <p className="text-xs text-muted-foreground">
                  Change or reset your password.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => (window.location.href = "/settings/account")}
            >
              Change password
            </Button>
          </Card>

          <Card className="rounded-xl border-border p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <MonitorSmartphone className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Two-factor authentication
                </p>
                <p className="text-xs text-muted-foreground">
                  {twoFactor ? "Enabled for this account." : "Add an extra layer of security."}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {twoFactor ? "Enabled" : "Disabled"}
              </span>
              <Switch
                checked={twoFactor}
                onCheckedChange={setTwoFactor}
                aria-label="Two-factor authentication"
              />
            </div>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Active sessions</h2>
            {sessions.filter((s) => !s.isCurrent).length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRevokeOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                Sign out of other devices
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {loadingSessions && (
              <p className="text-xs text-muted-foreground">Loading sessions…</p>
            )}
            {!loadingSessions &&
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <MonitorSmartphone className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-foreground">
                        {session.deviceLabel}
                        {session.isCurrent && (
                          <span className="ml-2 text-xs text-muted-foreground">(this device)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last active {formatLastActive(session.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            {!loadingSessions && sessions.length === 0 && (
              <p className="text-xs text-muted-foreground">No active sessions found.</p>
            )}
          </div>
        </section>

        <ConfirmDialog
          open={revokeOpen}
          onOpenChange={setRevokeOpen}
          title="Sign out of other devices?"
          description="This signs you out of every browser except the one you are using now. You will need to sign in again on those devices."
          confirmLabel="Sign out"
          cancelLabel="Keep signed in"
          destructive
          onConfirm={handleRevokeOthers}
          disabled={revoking}
        />

        <SaveBar isDirty={isDirty} onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}

function formatLastActive(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}