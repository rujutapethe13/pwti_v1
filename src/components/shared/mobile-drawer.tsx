"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings2, Users } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/components/shared/use-sign-out";
import {
  WORKSPACE_NAV_ITEMS,
  isNavItemActive,
} from "@/lib/workspace-nav";
import { useUser } from "@/lib/user-context";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

/**
 * The mobile navigation drawer: the workspace sidebar's sections, sliding in
 * from the left.
 *
 * The desktop rail shows the same sections in a 72px column; a phone has no
 * room for that, so the list becomes a drawer with Settings and Sign out at the
 * bottom. Both read WORKSPACE_NAV_ITEMS, so adding a section to one adds it to
 * the other.
 */

export function MobileDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Open navigation menu"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ☰
          </span>
        </Button>
      </SheetTrigger>
      <DrawerPanel onNavigate={() => onOpenChange(false)} />
    </Sheet>
  );
}

function DrawerPanel({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const { user, permissions } = useUser();
  const { activeWorkspace, hasHydrated } = useWorkspace();
  const { requestSignOut, pending } = useSignOut();

  const workspaceName = hasHydrated && activeWorkspace ? activeWorkspace.name : "Workspace";

  const itemClass = (active: boolean) =>
    cn(
      "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-accent font-medium text-accent-foreground"
        : "text-foreground hover:bg-accent hover:text-accent-foreground",
    );

  return (
    <SheetContent
      side="left"
      className="w-[288px] max-w-[85vw] gap-0 p-0"
      aria-label="Workspace navigation"
    >
      <SheetTitle className="sr-only">Workspace navigation</SheetTitle>

      <div className="border-b border-border px-4 py-4">
        <p className="truncate font-display text-base text-foreground">{workspaceName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user ? user.fullName : "Signed in"}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Workspace sections">
        <ul className="flex flex-col gap-0.5">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={itemClass(active)}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-2">
        <ul className="flex flex-col gap-0.5">
          <li>
            <Link
              href="/account/settings"
              onClick={onNavigate}
              aria-current={pathname.startsWith("/account/settings") ? "page" : undefined}
              className={itemClass(pathname.startsWith("/account/settings"))}
            >
              <Settings2 className="size-4 shrink-0" aria-hidden="true" />
              Settings
            </Link>
          </li>

          {permissions.canManageMembers && (
            <li>
              <Link
                href="/account/settings/members"
                onClick={onNavigate}
                aria-current={pathname === "/account/settings/members" ? "page" : undefined}
                className={itemClass(pathname === "/account/settings/members")}
              >
                <Users className="size-4 shrink-0" aria-hidden="true" />
                Members &amp; access
              </Link>
            </li>
          )}

          <li>
            <button
              type="button"
              disabled={!user || pending}
              onClick={() => {
                onNavigate();
                requestSignOut();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </li>
        </ul>
      </div>
    </SheetContent>
  );
}