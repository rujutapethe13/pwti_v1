"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function SaveBar({
  isDirty,
  onSave,
  saving,
  className,
}: {
  isDirty: boolean;
  onSave: () => void;
  saving: boolean;
  className?: string;
}) {
  if (!isDirty) return null;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-40 border-t border-border bg-background/80 px-6 py-3 backdrop-blur-sm md:relative md:border-0 md:bg-transparent md:backdrop-blur-none md:px-0",
        className,
      )}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="min-h-10 md:min-h-9"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}