"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import {
  LogOut,
  Moon,
  Settings,
  Sun,
  User as UserIcon,
  Users,
} from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/shared/skeleton";
import { accessRoleLabel } from "@/lib/members-types";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/components/shared/use-sign-out";
import type { AccountUser } from "@/lib/account-types";

/**
 * The account menu: the avatar in the top-right corner on desktop, and the same
 * content in a bottom sheet on mobile.
 *
 * ── Where the data comes from ────────────────────────────────────────────────
 * Everything shown here is read from UserProvider, which fetched /api/me once.
 * There is no fallback to a placeholder identity: a user who failed to load
 * renders a neutral avatar and the items stay disabled, because a made-up name
 * next to a sign-out button would be worse than nothing at all.
 *
 * ── One list, two surfaces ───────────────────────────────────────────────────
 * `useUserMenu` owns the items, their visibility and their handlers. The desktop
 * dropdown and the mobile sheet render them with different markup — Radix needs
 * DropdownMenuItem for its roving focus, a sheet needs links and 44px targets —
 * but they read from the same hook, so an item cannot appear in one and not the
 * other.
 *
 * ── Keyboard and pointer ─────────────────────────────────────────────────────
 * The dropdown closes on outside click and on Escape and moves between items
 * with the arrow keys, selecting with Enter. The sheet is a dialog, so it traps
 * focus and closes on Escape the same way.
 */

interface MenuItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  /** Owner and edit only. */
  requiresManage?: boolean;
}

/** Order is the spec's order: profile, settings, members, theme, then sign out. */
const MENU_ITEMS: MenuItem[] = [
  { id: "profile", label: "View profile", href: "/profile", icon: UserIcon },
  { id: "settings", label: "Settings & privacy", href: "/account/settings", icon: Settings },
  {
    id: "members",
    label: "Members & access",
    href: "/account/settings/members",
    icon: Users,
    requiresManage: true,
  },
];

export { MENU_ITEMS };

/** The avatar itself: top bar, mobile header and menu headers. */
export function UserAvatar({
  user,
  className,
}: {
  user: AccountUser | null;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
          className,
        )}
        aria-hidden="true"
      >
        <UserIcon className="size-4" />
      </span>
    );
  }

  return (
    <Avatar className={className}>
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
      <AvatarFallback className="text-xs font-semibold text-muted-foreground">
        {user.initials}
      </AvatarFallback>
    </Avatar>
  );
}

/** Owner / Edit / View, or nothing when they hold no membership at all. */
function RoleBadge({ user }: { user: AccountUser }) {
  if (!user.accessRole) return null;

  return (
    <Badge
      variant="secondary"
      className="w-fit px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide"
    >
      {accessRoleLabel(user.accessRole)}
    </Badge>
  );
}

/**
 * Avatar, real name, email, role badge and last login. Or a skeleton while it loads.
 */
function formatLastLogin(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return format(date, "d MMM yyyy 'at' HH:mm");
}

function MenuHeader({ user, className }: { user: AccountUser | null; className?: string }) {
  if (!user) {
    return (
      <div className={cn("flex items-center gap-3 px-2 py-2", className)}>
        <Skeleton.Base className="size-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton.Base className="h-3 w-24" />
          <Skeleton.Base className="h-2.5 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <UserAvatar user={user} className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-popover-foreground">{user.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        {user.lastLoginAt && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            Last login: {formatLastLogin(user.lastLoginAt)}
          </p>
        )}
      </div>
      <RoleBadge user={user} />
    </div>
  );
}

/**
 * The items, the visibility rules and the handlers, shared by both surfaces.
 */
function useUserMenu() {
  const router = useRouter();
  const { user, loading, error, permissions } = useUser();
  const { theme, setTheme } = useTheme();
  const { requestSignOut, pending } = useSignOut();

  const disabled = !user;

  const visibleItems = MENU_ITEMS.filter(
    (item) => !item.requiresManage || permissions.canManageMembers,
  );

  const toggleTheme = () => {
    // "system" is neither, so from the user's point of view the current theme is
    // whatever they can see. Move away from the resolved one rather than guess.
    const resolved = theme === "light" || theme === "dark" ? theme : null;
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  return {
    user,
    disabled,
    error,
    loading,
    visibleItems,
    pending,
    toggleTheme,
    requestSignOut,
    navigate: (href: string) => router.push(href),
  };
}

/** Sun/moon, before and after mount. */
function useThemeIcon() {
  const { theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Before mount the server said "system" and the browser may say otherwise, so
  // the icon would flip on hydration. Render a stable placeholder until it does.
  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";
  return { isDark, Icon: isDark ? Sun : Moon };
}

/** The desktop dropdown. */
export function UserMenu() {
  const menu = useUserMenu();
  const { isDark, Icon: ThemeIcon } = useThemeIcon();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full md:size-8"
          aria-label={menu.user ? `Account menu for ${menu.user.fullName}` : "Account menu"}
        >
          <UserAvatar user={menu.user} className="size-7" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {menu.error ? (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {menu.loading ? "Loading your account…" : menu.error}
          </DropdownMenuLabel>
        ) : (
          <DropdownMenuLabel className="p-2">
            <MenuHeader user={menu.user} />
          </DropdownMenuLabel>
        )}

        <DropdownMenuSeparator />

        {menu.visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.id}
              disabled={menu.disabled}
              onSelect={() => menu.navigate(item.href)}
              className="min-h-9 cursor-pointer"
            >
              <Icon className="mr-2 size-4" aria-hidden="true" />
              {item.label}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuItem onSelect={menu.toggleTheme} className="min-h-9 cursor-pointer">
          <ThemeIcon className="mr-2 size-4" aria-hidden="true" />
          Switch theme
          <span className="sr-only">
            {isDark ? " (currently dark)" : " (currently light)"}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={menu.disabled || menu.pending}
          onSelect={menu.requestSignOut}
          className="min-h-9 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" aria-hidden="true" />
          {menu.pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The mobile rendering of the same menu: a bottom sheet anchored above the
 * bottom bar, with 44px targets.
 *
 * `children` overrides the trigger, which is how the bottom bar supplies its own
 * tab button (avatar plus a label) instead of an icon-only one.
 */
export function UserMenuSheet({ children }: { children?: React.ReactNode }) {
  const menu = useUserMenu();
  const { Icon: ThemeIcon } = useThemeIcon();
  const [open, setOpen] = React.useState(false);

  const trigger =
    children ?? (
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 rounded-full"
        aria-label={menu.user ? `Account menu for ${menu.user.fullName}` : "Account menu"}
      >
        <UserAvatar user={menu.user} className="size-8" />
      </Button>
    );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        hideClose
        className="gap-0 pb-[max(0px,env(safe-area-inset-bottom))]"
      >
        <SheetTitle className="sr-only">Account</SheetTitle>

        <div className="border-b border-border px-4 pb-4 pt-5">
          {menu.error ? (
            <p className="text-xs text-muted-foreground">{menu.error}</p>
          ) : (
            <MenuHeader user={menu.user} />
          )}
        </div>

        <div className="flex flex-col gap-1 p-2">
          {menu.visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-disabled={menu.disabled || undefined}
                onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                  if (menu.disabled) {
                    event.preventDefault();
                    return;
                  }
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  menu.disabled && "pointer-events-none opacity-50",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={menu.toggleTheme}
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ThemeIcon className="size-4 shrink-0" aria-hidden="true" />
            Switch theme
          </button>
        </div>

        <div className="mt-auto border-t border-border p-2">
          <button
            type="button"
            disabled={menu.disabled || menu.pending}
            onClick={() => {
              setOpen(false);
              menu.requestSignOut();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {menu.pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}