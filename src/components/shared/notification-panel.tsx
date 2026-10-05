"use client";

/**
 * NotificationPanel
 *
 * Dropdown panel for notifications, triggered by a bell icon.
 * Shows notifications with an unread indicator.
 * Includes an empty state variant.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <NotificationPanel />
 * ────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Bell, CheckCheck, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { dashboardNotifications } from "@/features/boards/engine/demo-data";

export function NotificationPanel() {
  const [notifications] = useState(dashboardNotifications);
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3" aria-hidden="true" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Inbox className="mb-2 size-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground/60">No new notifications.</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {notifications.map((n) => (
              <button
                key={n.id}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  n.unread && "bg-accent/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{n.title}</span>
                  {n.unread && (
                    <span className="size-1.5 rounded-full bg-destructive" aria-label="Unread" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
                <span className="mt-0.5 text-[9px] text-muted-foreground/60">
                  {n.timestamp}
                </span>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

