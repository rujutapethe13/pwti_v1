"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  Command,
  UserPlus,
  Bell,
  User,
  Moon,
  Sun,
  X,
  Clock,
  Users,
  FileText,
  Star,
  LayoutGrid,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { mockUser } from "@/config/navigation";
import { dashboardNotifications } from "@/features/boards/engine/demo-data";
import { searchClient360Action } from "@/features/client-360/actions";
import type { Client360Match } from "@/features/client-360/types";

export function GlobalTopBar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<Client360Match[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const clientSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientSearchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  const notifications = dashboardNotifications;
  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      console.log("Search:", searchQuery);
    }
  }, [searchQuery]);

  const handleClientSearchChange = (value: string) => {
    setClientSearchQuery(value);
    if (clientSearchTimeoutRef.current) clearTimeout(clientSearchTimeoutRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setClientSearchResults([]);
      setClientSearchLoading(false);
      setClientSearchOpen(false);
      return;
    }

    setClientSearchLoading(true);
    setClientSearchOpen(true);
    clientSearchTimeoutRef.current = setTimeout(async () => {
      const res = await searchClient360Action(trimmed, { page: 1, pageSize: 5 });
      if (res.data) {
        const byClient = new Map<string, Client360Match>();
        for (const match of res.data.matches) {
          if (!byClient.has(match.clientName.toLowerCase())) {
            byClient.set(match.clientName.toLowerCase(), match);
          }
        }
        setClientSearchResults(Array.from(byClient.values()));
      } else {
        setClientSearchResults([]);
      }
      setClientSearchLoading(false);
    }, 300);
  };

  const handleClientSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (clientSearchTimeoutRef.current) clearTimeout(clientSearchTimeoutRef.current);
    const trimmed = clientSearchQuery.trim();
    if (trimmed) {
      router.push(`/client-360?q=${encodeURIComponent(trimmed)}`);
      setClientSearchOpen(false);
    }
  }, [clientSearchQuery, router]);

  const handleClientSearchResultClick = (clientName: string) => {
    if (clientSearchTimeoutRef.current) clearTimeout(clientSearchTimeoutRef.current);
    router.push(`/client-360?q=${encodeURIComponent(clientName)}`);
    setClientSearchOpen(false);
  };

  return (
    <header
      className="flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm"
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

        {/* Client Search Input */}
        <form onSubmit={handleClientSearchSubmit} className="relative">
          <Search
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={clientSearchInputRef}
            value={clientSearchQuery}
            onChange={(e) => handleClientSearchChange(e.target.value)}
            onBlur={() => {
              window.setTimeout(() => setClientSearchOpen(false), 120);
            }}
            onFocus={() => {
              if (clientSearchQuery.trim()) {
                setClientSearchOpen(true);
                if (clientSearchInputRef.current) {
                  const rect = clientSearchInputRef.current.getBoundingClientRect();
                  setDropdownPosition({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
                }
              }
            }}
            placeholder="Client search"
            className="h-9 w-52 pl-9 pr-20 text-sm"
            aria-label="Client search"
            aria-expanded={clientSearchOpen}
            role="combobox"
          />
          {clientSearchOpen && dropdownPosition &&
            createPortal(
              <div
                className="fixed z-[200] w-96 rounded-lg border border-border bg-white p-1 shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
                style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
              >
                {clientSearchLoading && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Searching clients...</div>
                )}
                {!clientSearchLoading && clientSearchResults.length === 0 && clientSearchQuery.trim() && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matching clients</div>
                )}
                {clientSearchResults.map((match) => (
                  <button
                    key={`${match.clientName}-${match.boardId}-${match.recordId}`}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleClientSearchResultClick(match.clientName)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {match.clientName.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{match.clientName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {match.workspaceName} / {match.boardName}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {match.status}
                    </span>
                  </button>
                ))}
              </div>,
              document.body,
            )
          }
          <Button
            type="submit"
            size="sm"
            className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
          >
            Search
          </Button>
        </form>
      </div>

      <div className="flex-1" />

      {/* ── Right Actions ────────────────────────────── */}
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="size-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
                  {unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-4 py-3 text-sm",
                      n.unread && "bg-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{n.title}</span>
                      {n.unread && (
                        <span className="size-1.5 rounded-full bg-destructive" aria-label="Unread" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="size-8" aria-label="Add person">
          <UserPlus className="size-4" aria-hidden="true" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="User menu">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {mockUser.avatar}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{mockUser.name}</span>
                <span className="text-xs text-muted-foreground">{mockUser.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 size-4" aria-hidden="true" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 size-4" aria-hidden="true" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />
      </div>
    </header>
  );
}