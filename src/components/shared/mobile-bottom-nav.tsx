"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
} from "lucide-react";
import * as React from "react";

import {
  NotificationList,
  UnreadBadge,
  useNotifications,
} from "@/components/shared/notification-list";
import { UserAvatar, UserMenuSheet } from "@/components/shared/user-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";

/**
 * The bottom navigation bar for phones and tablets.
 *
 * Five destinations, of which four navigate and one opens the account sheet:
 * Overview, Workspace, My work, Notifications, Me. The middle three are the
 * routes people move between most; the first and last are the two ends every
 * tab bar has.
 *
 * ── Notifications is a sheet, not a route ────────────────────────────────────
 * There is no notifications page in this app, and inventing one would be a much
 * larger change than a mobile bar warrants. It opens the same list the desktop
 * bell shows, and both badges read from `useNotifications`, so the count here and
 * the count in the top bar cannot disagree.
 *
 * ── Safe area ────────────────────────────────────────────────────────────────
 * iOS reports a home-indicator inset at the bottom of the viewport. A bar that
 * ignores it sits under the gesture area, so the padding is
 * `max(0.25rem, env(safe-area-inset-bottom))` — a base inset for devices that
 * report nothing, the real one when they do.
 *
 * It is `sticky` rather than `fixed` inside the scrolling column, so it settles
 * at the bottom of the content on a short page instead of floating over it.
 */

const NAV_ITEMS = [
  { id: "overview", label: "Overview", href: "/overview", icon: LayoutDashboard },
  { id: "workspace", label: "Workspace", href: "/workspace", icon: LayoutGrid },
  { id: "my-work", label: "My work", href: "/my-work", icon: ListChecks },
] as const;

const ACCOUNT_PREFIXES = ["/profile", "/account/settings"] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function tabClass(active: boolean) {
  return cn(
    "flex min-h-11 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
    active ? "text-foreground" : "text-muted-foreground",
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();

  return (
    <nav
      className="sticky bottom-0 z-[200] flex shrink-0 items-stretch gap-1 border-t border-border bg-background/95 px-1 pt-1 backdrop-blur-sm md:hidden"
      aria-label="Primary"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={tabClass(active)}
          >
            <Icon
              className={cn("size-5", active && "text-highlight")}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        );
      })}

      <NotificationsTab unreadCount={unreadCount} />

      <AccountTab pathname={pathname} />
    </nav>
  );
}

function NotificationsTab({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} className={tabClass(false)}>
        <span className="relative flex size-5 items-center justify-center">
          <Bell className="size-5" aria-hidden="true" />
          <UnreadBadge count={unreadCount} />
        </span>
        Notifications
      </button>

      <SheetContent
        side="bottom"
        className="gap-0 pb-[max(0px,env(safe-area-inset-bottom))]"
      >
        <SheetTitle className="px-4 py-3 text-sm font-medium text-foreground">
          Notifications
        </SheetTitle>
        <NotificationList className="max-h-[60vh]" />
      </SheetContent>
    </Sheet>
  );
}

/**
 * "Me" is the rightmost tab. It highlights across the whole account surface —
 * the profile page and every settings sub-page — rather than only on a route of
 * its own, because none of those routes is the tab.
 */
function AccountTab({ pathname }: { pathname: string }) {
  const { user } = useUser();
  const active = ACCOUNT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className="flex flex-1">
      <UserMenuSheet>
        <button type="button" className={tabClass(active)}>
          <UserAvatar
            user={user}
            className={cn(
              "size-5",
              active && "ring-1 ring-highlight ring-offset-1 ring-offset-background",
            )}
          />
          Me
        </button>
      </UserMenuSheet>
    </div>
  );
}