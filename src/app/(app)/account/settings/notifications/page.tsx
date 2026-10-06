"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SaveBar } from "@/app/(app)/account/settings/_save-bar";
import { type UserSettings } from "@/lib/account-types";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";

const TOPICS: {
  key: keyof UserSettings;
  label: string;
  description: string;
  emailKey: keyof UserSettings;
  inAppKey: keyof UserSettings;
}[] = [
  {
    key: "mentionsEmail",
    label: "Mentions",
    description: "When someone mentions you in a comment or description.",
    emailKey: "mentionsEmail",
    inAppKey: "mentionsInApp",
  },
  {
    key: "assignedEmail",
    label: "Assigned items",
    description: "When an item is assigned to you.",
    emailKey: "assignedEmail",
    inAppKey: "assignedInApp",
  },
  {
    key: "boardActivityEmail",
    label: "Board activity",
    description: "When a board you belong to changes.",
    emailKey: "boardActivityEmail",
    inAppKey: "boardActivityInApp",
  },
  {
    key: "invitesEmail",
    label: "Invites",
    description: "When you are invited to a workspace or board.",
    emailKey: "invitesEmail",
    inAppKey: "invitesInApp",
  },
];

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

export default function NotificationsSettingsPage() {
  const { user, settings, refresh } = useUser();
  const [saving, setSaving] = useState(false);

  const currentSettings = user ? { ...settings } : EMPTY_SETTINGS;

  const [form, setForm] = useState(currentSettings);

  const isDirty = useMemo(() => {
    if (!user) return false;
    return TOPICS.some(
      (topic) =>
        form[topic.emailKey] !== currentSettings[topic.emailKey] ||
        form[topic.inAppKey] !== currentSettings[topic.inAppKey],
    );
  }, [form, currentSettings, user]);

  const update = (patch: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const newSettings: Record<string, unknown> = {};
      for (const topic of TOPICS) {
        if (form[topic.emailKey] !== currentSettings[topic.emailKey]) {
          newSettings[topic.emailKey] = form[topic.emailKey];
        }
        if (form[topic.inAppKey] !== currentSettings[topic.inAppKey]) {
          newSettings[topic.inAppKey] = form[topic.inAppKey];
        }
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
        throw new Error(json.error ?? "Could not save your notification settings");
      }

      toast.success("Notification settings saved.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save your notification settings");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Sign in to manage your notifications.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what you are notified about and how.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-[1fr,auto,auto] items-center gap-3 px-3 text-xs font-medium text-muted-foreground">
          <span>Topic</span>
          <span className="text-center">Email</span>
          <span className="text-center">In app</span>
        </div>

        {TOPICS.map((topic) => (
          <div
            key={topic.key}
            className="grid grid-cols-[1fr,auto,auto] items-center gap-3 rounded-lg border border-border px-3 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{topic.label}</p>
              <p className="text-xs text-muted-foreground">{topic.description}</p>
            </div>
            <Switch
              checked={form[topic.emailKey] as boolean}
              onCheckedChange={(checked) =>
                update({ [topic.emailKey]: checked } as Partial<typeof form>)
              }
              aria-label={`${topic.label} email notifications`}
            />
            <Switch
              checked={form[topic.inAppKey] as boolean}
              onCheckedChange={(checked) =>
                update({ [topic.inAppKey]: checked } as Partial<typeof form>)
              }
              aria-label={`${topic.label} in-app notifications`}
            />
          </div>
        ))}

        <SaveBar isDirty={isDirty} onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}