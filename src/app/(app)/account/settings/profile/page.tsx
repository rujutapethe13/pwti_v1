"use client";

import { useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import { SaveBar } from "@/app/(app)/account/settings/_save-bar";
import { COMMON_TIMEZONES, LANGUAGES, initialsFromName, type MeResponse } from "@/lib/account-types";
import { useUser } from "@/lib/user-context";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

const TIMEZONE_OPTIONS = COMMON_TIMEZONES;
const LANGUAGE_OPTIONS = LANGUAGES;

export default function ProfileSettingsPage() {
  const {
    user,
    loading,
    error,
    settingsPersisted,
    settings,
    refresh,
    patchUser,
    applySnapshot,
  } = useUser();
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeSaving, setRemoveSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initialForm = useMemo(
    () =>
      user
        ? {
            fullName: user.fullName,
            jobTitle: settings.jobTitle ?? "",
            timezone: settings.timezone ?? "",
            language: settings.language ?? "",
          }
        : { fullName: "", jobTitle: "", timezone: "", language: "" },
    [user, settings],
  );

  const [form, setForm] = useState(initialForm);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl ?? null);

  const isDirty = useMemo(() => {
    if (!user) return false;
    return (
      form.fullName !== user.fullName ||
      form.jobTitle !== (settings.jobTitle ?? "") ||
      form.timezone !== (settings.timezone ?? "") ||
      form.language !== (settings.language ?? "") ||
      avatarPreview !== (user.avatarUrl ?? null)
    );
  }, [form, avatarPreview, user, settings]);

  useUnsavedChanges(isDirty);

  const update = (patch: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (form.fullName.trim() !== user.fullName) {
        body.profile = { fullName: form.fullName.trim() };
      }
      const newSettings: Record<string, unknown> = {};
      if (form.jobTitle !== (settings.jobTitle ?? "")) {
        newSettings.jobTitle = form.jobTitle.trim() || null;
      }
      if (form.timezone !== (settings.timezone ?? "")) {
        newSettings.timezone = form.timezone || null;
      }
      if (form.language !== (settings.language ?? "")) {
        newSettings.language = form.language || null;
      }
      if (Object.keys(newSettings).length > 0) {
        body.settings = newSettings;
      }

      if (Object.keys(body).length === 0) return;

      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => ({}))) as
        | (MeResponse & { error?: string })
        | { success: false; error: string; code: string };

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not save your profile");
      }

      applySnapshot(json as MeResponse);

      toast.success("Profile updated.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatar = async (file: File) => {
    if (!user || avatarSaving) return;
    setAvatarError(null);
    setAvatarSaving(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        avatarUrl?: string;
        initials?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not upload the photo");
      }
      setAvatarPreview(json.avatarUrl ?? null);
      patchUser({ avatarUrl: json.avatarUrl ?? null });
      toast.success("Photo updated.");
    } catch (cause) {
      setAvatarError(cause instanceof Error ? cause.message : "Could not upload the photo");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleAvatar(file);
    event.target.value = "";
  };

  const handleRemoveAvatar = async () => {
    if (!user || removeSaving) return;
    setRemoveSaving(true);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not remove the photo");
      }
      setAvatarPreview(null);
      patchUser({ avatarUrl: null });
      toast.success("Photo removed.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not remove the photo");
    } finally {
      setRemoveSaving(false);
      setRemoveOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Skeleton.Card />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <ErrorState
          title="Could not load your profile"
          message={error ?? "Please refresh the page."}
          onRetry={refresh}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This is how other people see you inside the workspace.
        </p>
      </div>

      <div className="space-y-6">
        <section className="flex flex-col items-start gap-4 rounded-xl border border-border p-6 sm:flex-row sm:items-center">
          <div className="relative">
            <Avatar className="size-20">
              {avatarPreview ? <AvatarImage src={avatarPreview} alt="" /> : null}
              <AvatarFallback className="bg-muted text-lg font-semibold text-muted-foreground">
                {initialsFromName(form.fullName || user.fullName)}
              </AvatarFallback>
            </Avatar>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute -right-1 -bottom-1 size-8 rounded-full p-0"
              aria-label="Change photo"
              onClick={() => fileRef.current?.click()}
              disabled={avatarSaving}
            >
              <Camera className="size-3.5" aria-hidden="true" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
              aria-label="Choose a profile photo"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Profile photo</p>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, WebP or GIF up to 2 MB.
            </p>
            {avatarError && (
              <p className="mt-1 text-xs text-destructive">{avatarError}</p>
            )}
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={avatarSaving}
              >
                {avatarSaving ? "Uploading…" : "Upload"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRemoveOpen(true)}
                disabled={avatarSaving || !avatarPreview}
              >
                Remove
              </Button>
            </div>
          </div>
        </section>

        <ConfirmDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title="Remove profile photo?"
          description="This removes your profile photo. You can upload a new one at any time."
          confirmLabel="Remove"
          cancelLabel="Keep photo"
          destructive
          onConfirm={handleRemoveAvatar}
          disabled={removeSaving}
        />

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => update({ fullName: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="jobTitle">Job title</Label>
            <Input
              id="jobTitle"
              value={form.jobTitle}
              onChange={(e) => update({ jobTitle: e.target.value })}
              placeholder="e.g. Producer"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="language">Language</Label>
            <Select
              value={form.language}
              onValueChange={(value) => update({ language: value })}
            >
              <SelectTrigger id="language" className="mt-1">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent sideOffset={8}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={form.timezone}
              onValueChange={(value) => update({ timezone: value })}
            >
              <SelectTrigger id="timezone" className="mt-1">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent sideOffset={8} className="max-h-72">
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={user.email}
              disabled
              className="mt-1 opacity-70"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Contact your administrator to change your email address.
            </p>
          </div>
        </section>

        <SaveBar
          isDirty={isDirty}
          onSave={handleSave}
          saving={saving}
          className="md:relative md:border-0 md:bg-transparent md:backdrop-blur-none md:px-0"
        />
      </div>
    </div>
  );
}