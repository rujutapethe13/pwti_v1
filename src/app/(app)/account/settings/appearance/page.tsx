"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveBar } from "@/app/(app)/account/settings/_save-bar";
import { useUser } from "@/lib/user-context";

export default function AppearanceSettingsPage() {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  const isDirty = theme !== "system";

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not save your preferences");
      }

      toast.success("Theme saved.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save your preferences");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Sign in to customise your appearance.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how the interface looks for you.
        </p>
      </div>

      <div className="space-y-6">
        <section>
          <Label htmlFor="theme">Theme</Label>
          <Select
            value={theme}
            onValueChange={(value) =>
              setTheme(value as "light" | "dark" | "system")
            }
            onOpenChange={setThemeOpen}
          >
            <SelectTrigger id="theme" className="mt-1">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent sideOffset={8}>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          {!themeOpen && (
            <p className="mt-1 text-xs text-muted-foreground">
              System follows your operating system preference.
            </p>
          )}
        </section>

        <SaveBar isDirty={isDirty} onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}