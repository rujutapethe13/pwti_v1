"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Cog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUser, useCanManageMembers } from "@/lib/user-context";
import {
  ACCOUNT_NAV_ITEMS,
  isAccountNavItemActive,
} from "@/app/(app)/account/settings/_nav";

/**
 * The settings shell.
 *
 * Desktop: a 220px left sidebar with the tab list and the content pane to its
 * right. The active tab is highlighted with `bg-accent` + `text-accent-foreground`.
 *
 * Mobile: the sidebar becomes a full-width tab list and the pages live below it.
 * Every sub-page shows a thin header bar with a back arrow pointing to the tab
 * list, so the path `/account/settings/profile` reads naturally as "settings →
 * profile".
 *
 * ── Members tab visibility ───────────────────────────────────────────────────
 * The Members & access tab is hidden below the sidebar entirely for users who
 * cannot manage memberships — they cannot reach the route by clicking, but the
 * URL still works so a shared link does not 404.
 */

export default function AccountSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isRoot = pathname === "/account/settings";

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <nav
        aria-label="Account settings"
        className="hidden shrink-0 border-r border-border bg-background md:block md:w-56 lg:w-60"
      >
        <AccountSidebar pathname={pathname} />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!isRoot && <MobileBackBar pathname={pathname} />}
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}

function MobileBackBar({ pathname }: { pathname: string }) {
  const active = ACCOUNT_NAV_ITEMS.find((item) =>
    pathname.startsWith(item.href),
  );

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 md:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Back to settings"
        asChild
      >
        <Link href="/account/settings">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
      </Button>
      <span className="text-sm font-medium text-foreground">
        {active?.label ?? "Settings"}
      </span>
    </div>
  );
}

function AccountSidebar({ pathname }: { pathname: string }) {
  const { permissions } = useUser();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Account settings
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage your profile, privacy and access.
        </p>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {ACCOUNT_NAV_ITEMS.map((item) => {
          if (item.requiresManage && !permissions.canManageMembers) return null;
          const Icon = item.icon;
          const active = isAccountNavItemActive(pathname, item.href);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border p-2">
        <Link
          href="/settings"
          className="flex min-h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span
            className="size-4 shrink-0"
            aria-hidden="true"
          >
            <Cog className="size-4" />
          </span>
          Open workspace settings board
        </Link>
      </div>
    </div>
  );
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}