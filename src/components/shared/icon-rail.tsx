"use client";

/**
 * IconRail
 *
 * Far-left vertical navigation rail (~72px wide).
 * Each item stacks an icon above a small text label, centered.
 * Stays fixed regardless of which workspace or board is active.
 * Has its own right border separating it from the Workspace panel.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <IconRail />
 * ────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Grid3X3,
  Bot,
  Star,
  ListChecks,
  CalendarDays,
  MoreHorizontal,
  LayoutDashboard,
  UserCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ACCENT = "#0073ea";

const topItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/overview" },
  { id: "workspace", label: "Workspace", icon: Grid3X3, href: "/workspace" },
  { id: "client-360", label: "Client 360", icon: UserCheck, href: "/client-360" },
  { id: "agents", label: "Agents", icon: Bot, href: "/agents" },
  { id: "favorites", label: "Favorites", icon: Star, href: "/favorites" },
  { id: "my-work", label: "My work", icon: ListChecks, href: "/my-work" },
  {
    id: "daily-activity",
    label: "Activity",
    icon: CalendarDays,
    href: "/daily-activity",
  },
  {
    id: "boards-hub",
    label: "Boards hub",
    icon: LayoutGrid,
    href: "/boards-hub",
  },
];

const bottomItems = [
  { id: "more", label: "More", icon: MoreHorizontal, href: "/more" },
];

export function IconRail() {
  const pathname = usePathname();

  const renderItem = (item: (typeof topItems)[number]) => {
    const Icon = item.icon;
    const isActive =
      pathname === item.href || pathname.startsWith(item.href + "/");

    return (
      <Link
        key={item.id}
        href={item.href}
        className={cn(
          "flex h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
          isActive
            ? "bg-[#e6f1fd] dark:bg-blue-500/15"
            : "text-[#555] dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-sidebar-accent dark:hover:text-foreground",
        )}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon
          className={cn(
            "size-5 shrink-0",
            isActive ? "text-[#0073ea] dark:text-blue-400" : "text-[#555] dark:text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            "text-[11px] leading-tight",
            isActive ? "text-[#0073ea] dark:text-blue-400 font-medium" : "text-[#555] dark:text-muted-foreground",
          )}
        >
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <nav
      className="flex w-[72px] shrink-0 flex-col items-center border-r border-border bg-white dark:bg-sidebar-background py-3"
      aria-label="Primary sections"
    >
      <div className="flex w-full flex-col items-center gap-0.5 px-2">
        {topItems.map(renderItem)}
      </div>

      <div className="flex w-full items-center justify-center px-2">
        <div className="h-px w-full bg-border" />
      </div>

      <div className="flex-1" />
      <div className="flex w-full flex-col items-center gap-0.5 px-2 pb-2">
        {bottomItems.map(renderItem)}
      </div>
    </nav>
  );
}
