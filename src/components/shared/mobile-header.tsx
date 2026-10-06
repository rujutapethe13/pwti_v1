"use client";

import { Search } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ClientSearch } from "@/components/shared/client-search";
import { MobileDrawer } from "@/components/shared/mobile-drawer";
import { UserMenuSheet } from "@/components/shared/user-menu";
import { siteConfig } from "@/config/site";
import { useWorkspace } from "@/lib/workspace-context";

/**
 * The compact header for phones and tablets: hamburger, title, search, avatar.
 *
 * Replaces the desktop top bar below 768px. That bar carries two search inputs
 * and a five-button action cluster, none of which fits this width, so search
 * collapses to an icon that opens a sheet and the remaining actions move into
 * the drawer and the bottom bar.
 *
 * The centre title is the active workspace when one is known, falling back to the
 * product name. A workspace name can be long, so it truncates rather than
 * pushing the buttons off centre.
 */
export function MobileHeader() {
  const { activeWorkspace, hasHydrated } = useWorkspace();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const title = hasHydrated && activeWorkspace ? activeWorkspace.name : siteConfig.name;

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background px-1 md:hidden"
      role="banner"
    >
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <h1 className="min-w-0 flex-1 truncate text-center font-display text-base text-foreground">
        {title}
      </h1>

      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label="Search clients"
        onClick={() => setSearchOpen(true)}
      >
        <Search className="size-5" aria-hidden="true" />
      </Button>

      <UserMenuSheet />

      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent
          side="bottom"
          className="gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="text-sm font-medium text-foreground">Search clients</SheetTitle>
          <ClientSearch showSubmitButton={false} autoFocus inputClassName="h-11 text-base" />
        </SheetContent>
      </Sheet>
    </header>
  );
}