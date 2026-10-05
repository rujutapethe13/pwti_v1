"use client";

/**
 * AppHeader
 *
 * Sticky top header with breadcrumbs, global search, quick create,
 * notifications, theme toggle, and user avatar.
 *
 * ── Features ───────────────────────────────────────────────
 * - Breadcrumbs derived from current pathname
 * - Global search opens CommandPalette (⌘K)
 * - Quick Create dropdown with mock actions
 * - Notifications dropdown with mock data + empty state
 * - Theme toggle (reuses existing component)
 * - User avatar dropdown
 * - Mobile hamburger menu toggle
 * ────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Menu,
  Plus,
  Search,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { boards, quickCreateActions, mockUser } from "@/config/navigation";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { NotificationPanel } from "@/components/shared/notification-panel";
import { CommandPalette } from "@/components/shared/command-palette";

interface AppHeaderProps {
  /** Called on mobile to open the sidebar sheet */
  onMenuClick?: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);

  // Derive breadcrumbs from pathname
  const breadcrumbs = pathname
    .split("/")
    .filter(Boolean)
    .map((segment, index, arr) => {
      const href = "/" + arr.slice(0, index + 1).join("/");
      const board = boards.find((b) => b.id === segment);
      return {
        label: board?.label ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " "),
        href,
        isLast: index === arr.length - 1,
      };
    });

  return (
    <>
      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6"
        role="banner"
      >
        {/* ── Mobile Menu ──────────────────────────────── */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>

        {/* ── Breadcrumbs ──────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
          <ol className="flex items-center gap-1.5 text-sm">
            {breadcrumbs.map((crumb) => (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {!crumb.isLast && (
                  <>
                    <Link
                      href={crumb.href}
                      className="truncate text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                    <ChevronRight
                      className="size-3.5 shrink-0 text-muted-foreground/40"
                      aria-hidden="true"
                    />
                  </>
                )}
                {crumb.isLast && (
                  <span
                    className="truncate font-medium text-foreground"
                    aria-current="page"
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Spacer ───────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Search ───────────────────────────────────── */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="hidden h-8 w-40 justify-between gap-2 text-xs text-muted-foreground md:inline-flex lg:w-56"
                onClick={() => setCommandOpen(true)}
                aria-label="Search boards and actions"
              >
                <span className="flex items-center gap-1.5">
                  <Search className="size-3.5" aria-hidden="true" />
                  Search...
                </span>
                <kbd className="hidden rounded border bg-muted px-1 py-0.5 text-[9px] lg:inline-flex">
                  ⌘K
                </kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search boards and actions</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* ── Mobile Search ────────────────────────────── */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden"
          onClick={() => setCommandOpen(true)}
          aria-label="Search"
        >
          <Search className="size-5" aria-hidden="true" />
        </Button>

        {/* ── Quick Create ─────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-black px-3 text-xs hover:bg-gray-50"
              aria-label="Quick create"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Quick Create
            </DropdownMenuLabel>
            {quickCreateActions.map((action) => {
              const Icon = action.icon;
              return (
                <DropdownMenuItem key={action.id} className="gap-3">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── Notifications ────────────────────────────── */}
        <NotificationPanel />

        {/* ── Theme Toggle ─────────────────────────────── */}
        <ThemeToggle />

        {/* ── User Avatar ──────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full"
              aria-label="User menu"
            >
              <Avatar className="size-8">
                <AvatarFallback className={cn("text-xs text-white", mockUser.avatarColor)}>
                  {mockUser.avatar}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <p className="font-medium text-foreground">{mockUser.name}</p>
                <p className="text-xs text-muted-foreground">{mockUser.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ── Command Palette ────────────────────────────── */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}

