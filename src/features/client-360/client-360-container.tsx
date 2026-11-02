"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { UserCheck, Briefcase } from "lucide-react";

import { RelationshipClient360 } from "./relationship-client-360";
import { Client360View } from "./client-360-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Client360ContainerProps {
  initialData?: {
    workspaces: Array<{ id: string; name: string }>;
    boards: Array<{ id: string; name: string; slug: string; workspaceId: string }>;
    clientColumns: Array<{
      boardId: string;
      boardName: string;
      columnId: string;
      columnLabel: string;
      clientType?: string;
    }>;
  };
}

export function Client360Container({ initialData }: Client360ContainerProps) {
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q");
  const viewParam = searchParams.get("view");
  const clientParam = searchParams.get("client");

  // Resolve matching real client from URL or search query
  const resolvedClientId = React.useMemo(() => {
    const raw = (clientParam || qParam || "").toLowerCase().trim();
    if (raw.includes("levi")) return "levis";
    if (raw.includes("safari")) return "safari";
    if (raw.includes("one8")) return "one8";
    if (raw.includes("lotto")) return "lotto";
    if (raw.includes("nasher")) return "nasher-miles";
    if (raw.includes("upper")) return "uppercase";
    if (raw.includes("welspun")) return "welspun";
    if (raw.includes("bio")) return "bioweaves";
    return "safari";
  }, [clientParam, qParam]);

  // If view=orders is explicitly requested, use cross-board orders table;
  // otherwise default to single-client 360 intelligence profile
  const [viewMode, setViewMode] = React.useState<"relationship" | "orders">(
    viewParam === "orders" ? "orders" : "relationship"
  );

  return (
    <div className="space-y-4">
      {/* Top Level View Selector */}
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
          <button
            onClick={() => setViewMode("relationship")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              viewMode === "relationship"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <UserCheck className="size-3.5 text-primary" />
            Client 360 Profile
          </button>
          <button
            onClick={() => setViewMode("orders")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              viewMode === "orders"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Briefcase className="size-3.5 text-primary" />
            Cross-Board Production Orders
          </button>
        </div>

        <span className="text-[11px] text-muted-foreground hidden sm:inline">
          {viewMode === "relationship"
            ? "Complete single-client relationship view"
            : "Search and filter client jobs across all production boards"}
        </span>
      </div>

      {viewMode === "relationship" ? (
        <RelationshipClient360
          initialClientId={resolvedClientId}
          onSwitchToStudioOrders={() => setViewMode("orders")}
        />
      ) : (
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <Client360View initialData={initialData} initialQuery={qParam ?? undefined} />
        </div>
      )}
    </div>
  );
}
