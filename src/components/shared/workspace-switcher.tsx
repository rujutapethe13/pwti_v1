"use client";

/**
 * WorkspaceSwitcher
 *
 * Dropdown for switching between workspaces.
 * Currently non-functional — shows mock workspaces.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <WorkspaceSwitcher />
 * ────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceOptionsMenu } from "@/components/shared/workspace-options-menu";
import { cn } from "@/lib/utils";
import { mockWorkspaces } from "@/config/navigation";

interface WorkspaceSwitcherProps {
  onRenameWorkspace?: (name: string) => void | Promise<void>;
  onDuplicateWorkspace?: (name: string) => void | Promise<void>;
  onDeleteWorkspace?: () => void | Promise<void>;
}

export function WorkspaceSwitcher({
  onRenameWorkspace,
  onDuplicateWorkspace,
  onDeleteWorkspace,
}: WorkspaceSwitcherProps = {}) {
  const [active, setActive] = useState(mockWorkspaces[0]);

  return (
    <div className="flex w-full items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 flex-1 justify-start gap-2 px-2 text-left text-xs font-medium",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            )}
          >
            <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1 truncate">{active.label}</span>
            <ChevronsUpDown className="size-3 text-muted-foreground/60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={8}
          className="w-56"
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {mockWorkspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setActive(ws)}
              className="gap-3"
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Building2 className="size-3 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{ws.label}</p>
                <p className="text-xs text-muted-foreground">{ws.plan}</p>
              </div>
              {ws.id === active.id && (
                <Check className="size-4 text-primary" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-xs text-muted-foreground">
            Manage Workspaces
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorkspaceOptionsMenu
        workspaceName={active.label}
        onRenameWorkspace={onRenameWorkspace}
        onDuplicateWorkspace={onDuplicateWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
      />
    </div>
  );
}

