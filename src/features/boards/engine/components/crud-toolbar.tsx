"use client";

import { useCallback } from "react";
import { Plus, RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUndoStack } from "../hooks/use-undo";

interface CrudToolbarAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  disabled?: boolean;
}

interface CrudToolbarProps {
  title?: string;
  actions: CrudToolbarAction[];
  showUndoRedo?: boolean;
  className?: string;
  loading?: boolean;
  children?: React.ReactNode;
}

export function CrudToolbar({ title, actions, showUndoRedo = true, className, loading, children }: CrudToolbarProps) {
  const { canUndo, canRedo, undo, redo } = useUndoStack();

  const handleUndo = useCallback(async () => {
    await undo();
    toast.info("Undo applied.");
  }, [undo]);

  const handleRedo = useCallback(async () => {
    await redo();
    toast.info("Redo applied.");
  }, [redo]);

  return (
    <div className={cn("flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 shadow-sm", className)}>
      <div className="flex items-center gap-2">
        {title && <h3 className="text-sm font-medium text-foreground">{title}</h3>}
        {children}
      </div>

      <div className="flex items-center gap-1">
        {showUndoRedo && (
          <>
            <Button variant="ghost" size="icon" onClick={handleUndo} disabled={!canUndo || loading} title="Undo (Ctrl+Z)">
              <RotateCcw className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRedo} disabled={!canRedo || loading} title="Redo (Ctrl+Shift+Z)">
              <RotateCw className="size-4" />
            </Button>
          </>
        )}

        {actions.map((action, i) => (
          <Button key={i} variant={action.variant ?? "default"} size="sm" onClick={action.onClick} disabled={action.disabled || loading}>
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CrudToolbarAddButton({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="default" size="sm" onClick={onClick}>
      <Plus className="mr-1 size-4" />
      {label}
    </Button>
  );
}
