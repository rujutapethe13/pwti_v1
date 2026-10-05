"use client";

/**
 * AppSidebar
 *
 * Primary navigation sidebar with collapsible state, workspace switcher,
 * board navigation, storage indicator, and user profile block.
 *
 * ── Features ───────────────────────────────────────────────
 * - Collapsible (icons only with tooltips when collapsed)
 * - Persists collapsed state in localStorage
 * - Active route highlighting via current pathname
 * - Full keyboard navigation (tab order, focus rings)
 * - Custom thin scrollbar
 * - Mobile responsive (renders inside a Sheet on small screens)
 * ────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  HardDrive,
  LogOut,
  MoreHorizontal,
  Settings,
  User,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { boards, mockStorage, mockUser } from "@/config/navigation";
import { WorkspaceSwitcher } from "@/components/shared/workspace-switcher";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Mobile sheet open state */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AppSidebar({
  collapsed,
  onToggle,
}: AppSidebarProps) {
  const pathname = usePathname();
  const storagePercent = (mockStorage.used / mockStorage.total) * 100;

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex flex-col border-r bg-sidebar-background text-sidebar-foreground transition-all duration-200 ease-in-out",
          "sidebar-scrollbar overflow-y-auto",
          collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-width)]",
        )}
        aria-label="Primary navigation"
      >
        {/* ── Logo + Toggle ────────────────────────────── */}
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
          {!collapsed && (
            <Link
              href="/workspace"
              className="flex items-center gap-2 overflow-hidden"
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
                P
              </div>
              <span className="truncate text-sm font-medium">Powerweave</span>
            </Link>
          )}
          {collapsed && (
            <Link
              href="/workspace"
              className="mx-auto flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold"
              aria-label="Powerweave Studio OS"
            >
              P
            </Link>
          )}
          <button
            onClick={onToggle}
            className={cn(
              "ml-auto flex size-6 items-center justify-center rounded-md text-sidebar-muted-foreground transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "mx-auto ml-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="size-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* ── Workspace Switcher ───────────────────────── */}
        <div className={cn("px-3 py-2", collapsed && "px-2")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <WorkspaceSwitcher />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Switch Workspace</TooltipContent>
            </Tooltip>
          ) : (
            <WorkspaceSwitcher />
          )}
        </div>

        {/* ── Navigation ───────────────────────────────── */}
        <nav className="flex-1 px-2 py-1" role="navigation" aria-label="Board navigation">
          <ul className="space-y-0.5" role="list">
            {boards.map((board) => {
              const Icon = board.icon;
              const isActive = pathname === board.href || pathname.startsWith(board.href + "/");
              const isSystem = board.isSystem;

              const navItem = (
                <li key={board.id}>
                  <Link
                    href={board.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      isSystem && "mt-2",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{board.label}</span>
                        {board.badge !== undefined && (
                          <span className="rounded-full bg-sidebar-muted px-1.5 py-0.5 text-[9px] font-medium text-sidebar-muted-foreground">
                            {board.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );

              if (collapsed) {
                return (
                  <Tooltip key={board.id}>
                    <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                    <TooltipContent side="right" className="flex items-center gap-2">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {board.label}
                      {board.badge !== undefined && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">
                          {board.badge}
                        </span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return navItem;
            })}
          </ul>
        </nav>

        {/* ── Storage Indicator ────────────────────────── */}
        <div className={cn("px-3 py-3", collapsed && "px-2")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <div className="flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent">
                    <HardDrive className="size-4 text-sidebar-muted-foreground" aria-hidden="true" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {mockStorage.used} {mockStorage.unit} / {mockStorage.total} {mockStorage.unit} used
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-sidebar-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="size-3.5" aria-hidden="true" />
                  Storage
                </span>
                <span>
                  {mockStorage.used}/{mockStorage.total} {mockStorage.unit}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-muted">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all duration-300"
                  style={{ width: `${storagePercent}%` }}
                  role="progressbar"
                  aria-valuenow={storagePercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Storage: ${storagePercent.toFixed(0)}% used`}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── User Profile ─────────────────────────────── */}
        <div className={cn("border-t border-sidebar-border px-3 py-3", collapsed && "px-2")}>
          {collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="mx-auto flex size-9 items-center justify-center rounded-full transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  aria-label="User menu"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className={cn("text-xs text-white", mockUser.avatarColor)}>
                      {mockUser.avatar}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <UserDropdownContent />
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className={cn("text-xs text-white", mockUser.avatarColor)}>
                      {mockUser.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden text-left">
                    <p className="truncate text-sm font-medium text-sidebar-foreground">
                      {mockUser.name}
                    </p>
                    <p className="truncate text-xs text-sidebar-muted-foreground">
                      {mockUser.role}
                    </p>
                  </div>
                  <MoreHorizontal className="size-4 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <UserDropdownContent />
            </DropdownMenu>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

/* ── Shared User Dropdown ───────────────────────────────── */
function UserDropdownContent() {
  return (
    <DropdownMenuContent align="end" side="right" className="w-56">
      <DropdownMenuLabel className="font-normal">
        <div className="flex flex-col">
          <p className="font-medium text-foreground">{mockUser.name}</p>
          <p className="text-xs text-muted-foreground">{mockUser.email}</p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="gap-2">
        <User className="size-4" aria-hidden="true" />
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem className="gap-2">
        <Settings className="size-4" aria-hidden="true" />
        Settings
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
        <LogOut className="size-4" aria-hidden="true" />
        Sign Out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

