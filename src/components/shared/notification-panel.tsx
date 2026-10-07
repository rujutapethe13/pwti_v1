"use client";

import { Bell, CheckCheck, Inbox, Users, LayoutGrid, UserCheck, Clock, AlertCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNotifications, type Notification, timeAgo } from "@/hooks/use-notifications";

const ICONS: Record<string, React.ElementType> = {
  workspace_invite: Users,
  board_invite: LayoutGrid,
  assignment: UserCheck,
  due_soon: Clock,
  overdue: AlertCircle,
};

export function NotificationPanel() {
  const { notifications, unreadCount, loading, error, markAsRead, markAllAsRead, dismiss } = useNotifications();
  const router = useRouter();

  const handleNotificationClick = async (n: Notification) => {
    await markAsRead(n.id);
    if (n.link) {
      router.push(n.link);
    }
  };

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
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
            {unreadCount}
          </span>
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
              onClick={markAllAsRead}
            >
              <CheckCheck className="size-3" aria-hidden="true" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-sm text-muted-foreground">Loading notifications...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-sm text-destructive">Could not load notifications.</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Inbox className="mb-2 size-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">You&apos;re all caught up.</p>
            <p className="text-xs text-muted-foreground/60">No new notifications.</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {notifications.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !n.is_read && "bg-accent/50",
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium text-foreground">{n.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!n.is_read && (
                        <span className="size-1.5 rounded-full bg-destructive shrink-0" aria-label="Unread" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(n.id);
                        }}
                        aria-label="Dismiss notification"
                      >
                        <Trash2 className="size-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{n.message}</p>
                  <span className="mt-0.5 text-[9px] text-muted-foreground/60 pl-6">
                    {timeAgo(n.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
