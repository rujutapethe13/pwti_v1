"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ACCOUNT_NAV_ITEMS, isAccountNavItemActive } from "@/app/(app)/account/settings/_nav";
import { useUser, useCanManageMembers } from "@/lib/user-context";
import { cn } from "@/lib/utils";

/**
 * Settings — the index screen.
 *
 * Desktop: the layout renders this inside the content pane beside the sidebar,
 * so the page body becomes a centred "pick a tab" card.
 *
 * Mobile: the layout makes this the first screen, so the same card is the top
 * of the mobile flow. A sub-page's back arrow returns here.
 *
 * Tabs a user cannot reach (Members, when they are View) are hidden from the
 * list rather than disabled, so the list never shows a dead end. The URL still
 * 404s cleanly if typed directly, which is better than a button that does
 * nothing.
 */
export default function AccountSettingsIndex() {
  const pathname = usePathname();
  const { permissions } = useUser();

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a section to edit.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ACCOUNT_NAV_ITEMS.map((item) => {
          if (item.requiresManage && !permissions.canManageMembers) return null;
          const Icon = item.icon;
          const active = isAccountNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl border border-border p-4 transition-colors",
                "hover:border-highlight/40 hover:bg-accent/50",
                active && "border-highlight/60 bg-accent/40",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-foreground">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}