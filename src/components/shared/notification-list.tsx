"use client";

import { dashboardNotifications } from "@/features/boards/engine/demo-data";
import { cn } from "@/lib/utils";

/**
 * The notification feed, shared by the desktop bell dropdown and the mobile
 * bottom-bar item so the unread badge and the list can never disagree about the
 * count.
 */

export interface NotificationSummary {
  notifications: typeof dashboardNotifications;
  unreadCount: number;
}

export function useNotifications(): NotificationSummary {
  const notifications = dashboardNotifications;
  const unreadCount = notifications.filter((entry) => entry.unread).length;
  return { notifications, unreadCount };
}

export function NotificationList({
  className,
}: {
  className?: string;
}) {
  const { notifications } = useNotifications();

  if (notifications.length === 0) {
    return (
      <div className={cn("flex flex-col items-center py-8 text-center", className)}>
        <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
      </div>
    );
  }

  return (
    <div className={cn("max-h-72 overflow-y-auto", className)}>
      {notifications.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            "flex w-full flex-col gap-0.5 px-4 py-3 text-sm",
            entry.unread && "bg-accent/50",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{entry.title}</span>
            {entry.unread && (
              <span className="size-1.5 rounded-full bg-destructive" aria-label="Unread" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{entry.message}</p>
        </div>
      ))}
    </div>
  );
}

/** The count badge on the bell and on the bottom-bar item. */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
      {count}
      <span className="sr-only"> unread notifications</span>
    </span>
  );
}