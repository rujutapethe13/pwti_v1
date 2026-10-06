"use client";

import {
  LayoutDashboard,
  LayoutGrid,
  Grid3X3,
  ListChecks,
  Star,
  Bot,
  CalendarDays,
} from "lucide-react";

/**
 * The workspace navigation, as data.
 *
 * The icon rail and the mobile drawer both render this list, so a new section
 * appears in both at once and the two cannot fall out of step. Hrefs match the
 * rail's existing routes exactly — moving one here moves it in the sidebar too.
 */

export interface WorkspaceNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
}

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { id: "overview", label: "Overview", href: "/overview", icon: LayoutDashboard },
  { id: "workspace", label: "Workspace", href: "/workspace", icon: Grid3X3 },
  { id: "agents", label: "Agents", href: "/agents", icon: Bot },
  { id: "favorites", label: "Favorites", href: "/favorites", icon: Star },
  { id: "my-work", label: "My work", href: "/my-work", icon: ListChecks },
  { id: "daily-activity", label: "Activity", href: "/daily-activity", icon: CalendarDays },
  { id: "boards-hub", label: "Boards hub", href: "/boards-hub", icon: LayoutGrid },
];

/** Prefixes that mark a nav item active. `href` itself is always included. */
const ACTIVE_PREFIXES: Record<string, string[]> = {
  overview: ["/overview"],
  workspace: ["/workspace"],
  "boards-hub": ["/boards-hub"],
};

export function isNavItemActive(pathname: string, item: WorkspaceNavItem): boolean {
  const prefixes = ACTIVE_PREFIXES[item.id] ?? [item.href];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}