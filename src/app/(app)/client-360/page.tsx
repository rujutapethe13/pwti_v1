"use client";

import { Suspense, useCallback } from "react";
import { useSharedData } from "@/lib/use-shared-data";
import { Client360Container } from "@/features/client-360/client-360-container";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Client360InitialData {
  workspaces: Array<{ id: string; name: string }>;
  boards: Array<{ id: string; name: string; slug: string; workspaceId: string }>;
  clientColumns: Array<{
    boardId: string;
    boardName: string;
    columnId: string;
    columnLabel: string;
    clientType?: string;
  }>;
}

async function fetchClient360InitialData(force = false): Promise<Client360InitialData | null> {
  const res = await fetch(`/api/client-360${force ? "?refresh=1" : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load client-360 initial data");
  const json = await res.json();
  return json.data ?? null;
}

function Client360ViewSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 w-32 bg-muted animate-pulse rounded" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-xl border" />
        ))}
      </div>
      <div className="h-60 bg-muted animate-pulse rounded-xl border" />
    </div>
  );
}

export default function ClientsPage() {
  const { data: initialData, loading, refreshing, error, refresh } = useSharedData<Client360InitialData | null>(
    "client-360-initial",
    () => fetchClient360InitialData(),
    { ttlMs: 3 * 60 * 1000 },
  );

  if (error) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 text-destructive text-sm">
        {error}
        <Button onClick={refresh} disabled={refreshing} variant="outline" size="sm" className="mt-2">
          <RefreshCw className="mr-1 size-3.5" /> Synced just now
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 flex items-center justify-between">
        <Button onClick={refresh} disabled={refreshing} size="sm" className="text-xs">
          <RefreshCw className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Synced just now
        </Button>
      </div>
      <Suspense fallback={<Client360ViewSkeleton />}>
        <Client360Container initialData={initialData ?? undefined} />
      </Suspense>
    </div>
  );
}
