"use client";

import { useCallback, useState } from "react";
import {
  Search,
  Command,
  UserPlus,
  Bell,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ClientSearch } from "@/components/shared/client-search";
import {
  NotificationList,
  UnreadBadge,
  useNotifications,
} from "@/components/shared/notification-list";
import { UserMenu } from "@/components/shared/user-menu";

export function GlobalTopBar() {
  const [searchQuery, setSearchQuery] = useState("");
  const { unreadCount } = useNotifications();

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      console.log("Search:", searchQuery);
    }
  }, [searchQuery]);

  return (
    <header
      className="hidden h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm md:flex"
      role="banner"
    >
      {/* ── Left Search Area ──────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Main Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for anything..."
            className="h-9 w-52 pl-9 pr-16 text-sm"
            aria-label="Search for anything"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Command className="size-3" aria-hidden="true" />K
          </span>
        </form>

        {/* Client Search — hidden below lg, where the mobile header's search icon
            takes over so the two inputs cannot collide. */}
        <ClientSearch className="hidden lg:block" inputClassName="w-52" />
      </div>

      <div className="flex-1" />

      {/* ── Right Actions ────────────────────────────── */}
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="size-5" aria-hidden="true" />
              <UnreadBadge count={unreadCount} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-popover p-0 text-popover-foreground">
            <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
              <span>Notifications</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="mx-0" />
            <NotificationList />
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="size-8" aria-label="Add person">
          <UserPlus className="size-4" aria-hidden="true" />
        </Button>

        <UserMenu />

        <ThemeToggle />
      </div>
    </header>
  );
}