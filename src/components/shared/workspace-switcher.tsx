"use client";

/**
 * WorkspaceSwitcher
 *
 * Dropdown for switching between the workspaces the current user is a member
 * of. The list comes from the server (`listUserWorkspaces`), which enforces
 * membership server-side, so a workspace the user is not a member of never
 * appears here. Selecting one opens `/workspaces/[id]/overview`.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <WorkspaceSwitcher />
 * ────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronsUpDown } from "lucide-react";

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
import { EmptyState } from "@/components/shared/empty-state";
import { listUserWorkspaces } from "@/features/workspaces/workspace-list-action";

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
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{
    id: string;
    name: string;
    slug: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listUserWorkspaces()
      .then((list) => {
        if (cancelled) return;
        setWorkspaces(list);
        if (!active && list.length > 0) setActive(list[0]);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load workspaces");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (workspaces === null) {
    return (
      <div className="flex w-full items-center gap-1">
        <Button variant="ghost" size="sm" disabled className="h-8 flex-1 justify-start gap-2 px-2 text-left text-xs font-medium opacity-50">
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate">Loading workspaces</span>
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 flex-1 justify-start gap-2 px-2 text-left text-xs font-medium text-destructive" onClick={() => window.location.reload()}>
          <Building2 className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          <span className="flex-1 truncate">Workspaces unavailable</span>
        </Button>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex w-full items-center gap-1">
        <Button variant="ghost" size="sm" disabled className="h-8 flex-1 justify-start gap-2 px-2 text-left text-xs font-medium opacity-50">
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate">No workspaces</span>
        </Button>
        <EmptyState
          title="No workspaces yet"
          description="You are not a member of any workspace. Ask an administrator to add you to one."
          compact
          className="mt-1 w-56"
        />
      </div>
    );
  }

  const selected = active ?? workspaces[0];

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
            <span className="flex-1 truncate">{selected.name}</span>
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
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => {
                setActive(ws);
                router.push(`/workspaces/${ws.id}/overview`);
              }}
              className="gap-3"
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Building2 className="size-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ws.name}</p>
                <p className="text-xs text-muted-foreground truncate">{ws.role}</p>
              </div>
              {ws.id === selected.id && (
                <span className="shrink-0 text-xs text-primary">{selected.role}</span>
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
        workspaceName={selected.name}
        onRenameWorkspace={onRenameWorkspace}
        onDuplicateWorkspace={onDuplicateWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
      />
    </div>
  );
}
