"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchClient360Action } from "@/features/client-360/actions";
import type { Client360Match } from "@/features/client-360/types";
import { cn } from "@/lib/utils";

/**
 * Client search: type a client name, get matching boards.
 *
 * Extracted from the global top bar so the mobile header can offer the same
 * search behind an icon instead of a 208px input that does not fit a phone. The
 * desktop rendering is unchanged — same debounce, same 5-result cap, same
 * collapsed-by-client list — and the two entry points share one implementation
 * so they cannot drift.
 *
 * The results are portalled to the body because the input lives inside a
 * `h-14 overflow-hidden` bar on desktop, which would clip an absolutely
 * positioned list.
 */

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 5;

export function ClientSearch({
  className,
  inputClassName,
  showSubmitButton = true,
  autoFocus = false,
}: {
  className?: string;
  inputClassName?: string;
  showSubmitButton?: boolean;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Client360Match[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  React.useEffect(() => clearTimer, []);

  const anchorTo = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
  };

  const search = (value: string) => {
    clearTimer();
    const trimmed = value.trim();

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    setLoading(true);
    setOpen(true);
    timeoutRef.current = setTimeout(async () => {
      const res = await searchClient360Action(trimmed, { page: 1, pageSize: RESULT_LIMIT });
      if (res.data) {
        // One row per client, keeping the first board that matched.
        const byClient = new Map<string, Client360Match>();
        for (const match of res.data.matches) {
          if (!byClient.has(match.clientName.toLowerCase())) {
            byClient.set(match.clientName.toLowerCase(), match);
          }
        }
        setResults(Array.from(byClient.values()));
      } else {
        setResults([]);
      }
      setLoading(false);
    }, DEBOUNCE_MS);
  };

  const openClient = (clientName: string) => {
    clearTimer();
    setOpen(false);
    setQuery(clientName);
    router.push(`/client-360?q=${encodeURIComponent(clientName)}`);
  };

  const dropdown =
    open && position
      ? createPortal(
          <div
            className="fixed z-[200] w-96 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
            style={{ top: position.top, left: position.left }}
          >
            {loading && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Searching clients...</div>
            )}
            {!loading && results.length === 0 && query.trim() && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No matching clients</div>
            )}
            {results.map((match) => (
              <button
                key={`${match.clientName}-${match.boardId}-${match.recordId}`}
                type="button"
                className="flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openClient(match.clientName)}
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
      : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        clearTimer();
        const trimmed = query.trim();
        if (trimmed) openClient(trimmed);
      }}
      className={cn("relative", className)}
      role="search"
    >
      <Search
        className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          search(event.target.value);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onFocus={() => {
          if (query.trim()) {
            setOpen(true);
            anchorTo();
          }
        }}
        placeholder="Client search"
        className={cn("h-9 pl-9 text-sm", showSubmitButton && "pr-20", inputClassName)}
        aria-label="Client search"
        aria-expanded={open}
        autoFocus={autoFocus}
        role="combobox"
      />
      {showSubmitButton && (
        <Button
          type="submit"
          size="sm"
          className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
        >
          Search
        </Button>
      )}
      {dropdown}
    </form>
  );
}