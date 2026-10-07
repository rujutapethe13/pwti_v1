"use client";

import { Bell, CheckCheck, Inbox, Users, LayoutGrid, UserCheck, Clock, AlertCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotifications, timeAgo } from "@/hooks/use-notifications";

const ICONS: Record<string, React.ElementType> = {
  workspace_invite: Users,
  board_invite: LayoutGrid,
  assignment: UserCheck,
  due_soon: Clock,
  overdue: AlertCircle,
};

export function NotificationList({
  className,
}: {
  className?: string;
}) {
  const { notifications, loading, error, markAllAsRead, dismiss } = useNotifications();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div className={cn("flex flex-col items-center py-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">Loading notifications...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex flex-col items-center py-8 text-center", className)}>
        <p className="text-sm text-destructive">Could not load notifications.</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className={cn("flex flex-col items-center py-8 text-center", className)}>
        <Inbox className="mb-2 size-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">You&apos;re all caught up.</p>
        <p className="text-xs text-muted-foreground/60">No new notifications.</p>
      </div>
    );
  }

  return (
    <div className={cn("max-h-72 overflow-y-auto", className)}>
      {unreadCount > 0 && (
        <div className="flex justify-end px-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto gap-1 p-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={markAllAsRead}
          >
            <CheckCheck className="size-3" aria-hidden="true" />
            Mark all as read
          </Button>
        </div>
      )}
      {notifications.map((entry) => {
        const Icon = ICONS[entry.type] ?? Bell;
        return (
          <div
            key={entry.id}
            className={cn(
              "flex w-full flex-col gap-0.5 px-4 py-3 text-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !entry.is_read && "bg-accent/50",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{entry.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {!entry.is_read && (
                  <span className="size-1.5 rounded-full bg-destructive shrink-0" aria-label="Unread" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(entry.id);
                  }}
                  aria-label="Dismiss notification"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pl-6">{entry.message}</p>
            <span className="mt-0.5 text-[9px] text-muted-foreground/60 pl-6">
              {timeAgo(entry.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The count badge on the bell and on the bottom-bar item. */
export function UnreadBadge({ count }: { count: number }) {
  const display = count > 9 ? "9+" : count;
  if (count <= 0) return null;

  return (
    <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
      {display}
      <span className="sr-only"> unread notifications</span>
    </span>
  );
}

export { useNotifications, timeAgo };
