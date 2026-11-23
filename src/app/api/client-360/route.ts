import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getClient360InitialData, clearSearchCache } from "@/features/client-360/search-service";
import { timeApi } from "@/lib/board-data-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return timeApi("/api/client-360/initial", async () => {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    if (forceRefresh) clearSearchCache();
    const data = await getClient360InitialData();
    return NextResponse.json({ data, cached: !forceRefresh });
  });
}
