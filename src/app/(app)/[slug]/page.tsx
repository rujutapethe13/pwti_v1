import { Suspense } from "react";
import Link from "next/link";

import { EngineBoardPage } from "@/components/shared/engine-board-page";
import { loadBoardPageData } from "@/features/boards/engine/data";
import { checkBoardAccessBySlug } from "@/features/boards/engine/repository";

interface DynamicBoardPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function DynamicBoardPage({ params }: DynamicBoardPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;

  console.warn(`[DynamicBoardPage] Loading board page for slug: ${slug}`);

  // ── Access gate: open by default, restricted by exception ──────────
  const access = await checkBoardAccessBySlug(slug);

  if (!access.allowed) {
    console.warn(`[DynamicBoardPage] Access denied for board "${slug}": ${access.reason}`);

    if (access.reason === "not_found") {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h1 className="text-2xl font-semibold">Board not found</h1>
          <p className="mt-2 text-muted-foreground">
            The board &quot;{slug}&quot; does not exist or has been deleted.
          </p>
        </div>
      );
    }

    // Access denied — restricted board without approval
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-2xl font-semibold">Access restricted</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          This board is restricted. Request access from the <Link href="/boards-hub" className="underline">Boards hub</Link> and wait for the workspace owner to approve your request.
        </p>
      </div>
    );
  }

  let data;
  try {
    data = await loadBoardPageData(slug);
  } catch (error) {
    console.error(`[DynamicBoardPage] Failed to load board "${slug}":`, error);
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">
          Could not load board &quot;{slug}&quot;. Please try again.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!data) {
    console.warn(`[DynamicBoardPage] Board not found for slug: ${slug}`);
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-2xl font-semibold">Board not found</h1>
        <p className="mt-2 text-muted-foreground">
          The board &quot;{slug}&quot; does not exist or has been deleted.
        </p>
      </div>
    );
  }

  console.warn(`[DynamicBoardPage] Loaded board "${data.board.name}" (${data.board.id}) with ${data.columns.length} columns, ${data.records.length} records, ${data.views.length} views, ${data.groups.length} groups`);

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">Loading board…</div>}>
      <EngineBoardPage data={data} />
    </Suspense>
  );
}
