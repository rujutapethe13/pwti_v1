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
} from "lucide-react";

import { cn } from "@/lib/utils";

const ACCENT = "#0073ea";

const topItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/overview" },
  { id: "workspace", label: "Workspace", icon: Grid3X3, href: "/workspace" },
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
            ? "bg-[#e6f1fd]"
            : "text-[#555] hover:bg-gray-100",
        )}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon
          className={cn(
            "size-5 shrink-0",
            isActive ? "" : "text-[#555]",
          )}
          style={isActive ? { color: ACCENT } : undefined}
          aria-hidden="true"
        />
        <span
          className={cn(
            "text-[11px] leading-tight",
            isActive ? "" : "text-[#555]",
          )}
          style={isActive ? { color: ACCENT } : undefined}
        >
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <nav
      className="flex w-[72px] shrink-0 flex-col items-center border-r border-[#e6e6e6] bg-white py-3"
      aria-label="Primary sections"
    >
      <div className="flex w-full flex-col items-center gap-0.5 px-2">
        {topItems.map(renderItem)}
      </div>

      <div className="flex w-full items-center justify-center px-2">
        <div className="h-px w-full bg-[#e6e6e6]" />
      </div>

      <div className="flex-1" />
      <div className="flex w-full flex-col items-center gap-0.5 px-2 pb-2">
        {bottomItems.map(renderItem)}
      </div>
    </nav>
  );
}
