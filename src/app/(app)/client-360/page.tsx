import { Suspense } from "react";
import { getClient360InitialDataAction } from "@/features/client-360/actions";
import { Client360View } from "@/features/client-360/client-360-view";

async function getInitialData() {
  const res = await getClient360InitialDataAction();
  if (res.error || !res.data) {
    console.error("Failed to load client-360 initial data:", res.error);
    return undefined;
  }
  return res.data;
}

function Client360ViewSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
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

export default async function ClientsPage() {
  const initialData = await getInitialData();

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-normal leading-tight text-foreground sm:text-4xl">
          Client 360
        </h1>
        <p className="text-sm text-muted-foreground">
          Search, analyze, and track client work across all boards
        </p>
      </div>

      <Suspense fallback={<Client360ViewSkeleton />}>
        <Client360View initialData={initialData} />
      </Suspense>
    </div>
  );
}