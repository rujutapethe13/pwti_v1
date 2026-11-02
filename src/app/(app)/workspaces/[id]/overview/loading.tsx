export default function WorkspaceOverviewLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-6 py-10 sm:px-8 lg:px-12">
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 items-center justify-center rounded-lg bg-muted size-14" />
        <div className="space-y-2 flex-1">
          <div className="bg-muted h-4 w-48 animate-pulse rounded" />
          <div className="bg-muted h-3 w-32 animate-pulse rounded" />
        </div>
      </div>
      <div className="bg-muted h-9 w-40 animate-pulse rounded" />
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="bg-muted h-4 w-24 animate-pulse rounded mb-3" />
          <CardSkeleton />
        </section>
        <section className="space-y-5">
          <div className="bg-muted h-4 w-32 animate-pulse rounded mb-3" />
          <CardSkeleton />
          <div className="bg-muted h-4 w-48 animate-pulse rounded mb-3" />
          <CardSkeleton />
        </section>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="border-border p-6 rounded-lg bg-background">
      <div className="space-y-3">
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="bg-muted shrink-0 size-10 rounded animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="bg-muted h-4 w-40 animate-pulse rounded" />
              <div className="bg-muted h-3 w-24 animate-pulse rounded" />
              <div className="bg-muted h-3 w-16 animate-pulse rounded" />
              <div className="bg-muted h-3 w-12 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
