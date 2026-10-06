"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SaveBar } from "@/app/(app)/account/settings/_save-bar";
import { PROFILE_VISIBILITY_OPTIONS, type ProfileVisibility, type UserSettings } from "@/lib/account-types";
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

export default function PrivacySettingsPage() {
  const { user, settings, refresh, patchUser } = useUser();
  const [saving, setSaving] = useState(false);

  const currentSettings = user ? { ...settings } : EMPTY_SETTINGS;

  const [form, setForm] = useState(currentSettings);

  const isDirty = useMemo(() => {
    if (!user) return false;
    return (
      form.profileVisibility !== currentSettings.profileVisibility ||
      form.showOnlineStatus !== currentSettings.showOnlineStatus ||
      form.showLastActive !== currentSettings.showLastActive
    );
  }, [form, currentSettings, user]);

  const update = (patch: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const newSettings: Record<string, unknown> = {};
      if (form.profileVisibility !== currentSettings.profileVisibility) {
        newSettings.profileVisibility = form.profileVisibility;
      }
      if (form.showOnlineStatus !== currentSettings.showOnlineStatus) {
        newSettings.showOnlineStatus = form.showOnlineStatus;
      }
      if (form.showLastActive !== currentSettings.showLastActive) {
        newSettings.showLastActive = form.showLastActive;
      }

      if (Object.keys(newSettings).length === 0) return;

      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: newSettings }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not save your privacy settings");
      }

      toast.success("Privacy settings saved.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save your privacy settings");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Sign in to manage your privacy.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Privacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control who can see your profile and your presence.
        </p>
      </div>

      <div className="space-y-6">
        <section className="space-y-3">
          <Label>Who can see my profile</Label>
          <div className="space-y-2">
            {PROFILE_VISIBILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors",
                  form.profileVisibility === option.value
                    ? "border-highlight/60 bg-accent/40"
                    : "hover:bg-accent/30",
                )}
              >
                <input
                  type="radio"
                  name="profileVisibility"
                  value={option.value}
                  checked={form.profileVisibility === option.value}
                  onChange={() => update({ profileVisibility: option.value })}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="showOnlineStatus" className="text-sm font-medium">
                Show online status
              </Label>
              <p className="text-xs text-muted-foreground">
                Let others see when you are active.
              </p>
            </div>
            <Switch
              id="showOnlineStatus"
              checked={form.showOnlineStatus}
              onCheckedChange={(checked) => update({ showOnlineStatus: checked })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="showLastActive" className="text-sm font-medium">
                Show last active
              </Label>
              <p className="text-xs text-muted-foreground">
                Display when you were last online.
              </p>
            </div>
            <Switch
              id="showLastActive"
              checked={form.showLastActive}
              onCheckedChange={(checked) => update({ showLastActive: checked })}
            />
          </div>
        </section>

        <SaveBar isDirty={isDirty} onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}